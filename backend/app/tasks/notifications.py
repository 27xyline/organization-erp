"""Standalone notification worker; the API lifespan never starts this loop."""

from __future__ import annotations

import asyncio
import logging
import signal
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from opentelemetry import metrics as api_metrics
from opentelemetry import trace as api_trace
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.trace import TracerProvider
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.core.context import RequestContext
from app.core.metrics import (
    DatabaseMetricInstruments,
    NotificationWorkerMetrics,
    acquire_session_connection,
    create_database_metric_instruments,
    install_sqlalchemy_observability,
    record_pool_wait,
)
from app.core.observability import ObservabilityRuntime, create_observability
from app.core.tracing import trace_async_operation
from app.db.session import create_engine, create_session_factory
from app.db.uow import create_unit_of_work_factory
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.integrations.outbox_email import SmtpOutboxSender
from app.repositories.scheduled_alerts import (
    SqlAlchemyScheduledAlertLock,
    SqlAlchemyScheduledAlertQueries,
)
from app.services.outbox import process_outbox
from app.services.scheduled_alerts import ScheduledAlertContext, run_scheduled_alerts

logger = logging.getLogger(__name__)
Job = Callable[[], Awaitable[object]]


async def run_notification_worker(
    stop: asyncio.Event,
    process_email: Job,
    run_alerts: Job,
    metrics: NotificationWorkerMetrics | None = None,
    snapshot: Job | None = None,
) -> None:
    while not stop.is_set():
        _metric_call(metrics.heartbeat if metrics is not None else None)
        await asyncio.gather(
            _run_job("outbox", process_email, metrics, "outbox"),
            _run_job("scheduled alerts", run_alerts, metrics, "scheduled_alerts"),
        )
        if snapshot is not None:
            try:
                await snapshot()
            except Exception as error:
                logger.error("Notification worker snapshot failed (%s)", type(error).__name__)
        if stop.is_set():
            break
        try:
            await asyncio.wait_for(stop.wait(), timeout=30)
        except TimeoutError:
            pass


async def _run_job(
    name: str,
    job: Job,
    metrics: NotificationWorkerMetrics | None = None,
    metric_job: str | None = None,
) -> bool:
    succeeded = True
    try:
        await job()
    except Exception as error:
        logger.error("Notification worker job failed: %s (%s)", name, type(error).__name__)
        succeeded = False
    if metrics is not None and metric_job is not None:
        _metric_call(lambda: metrics.record_job(metric_job, succeeded))
    return succeeded


def _metric_call(callback: Callable[[], object] | None) -> None:
    if callback is None:
        return
    try:
        callback()
    except Exception as error:
        logger.error("Notification worker metric update failed (%s)", type(error).__name__)


async def _update_snapshot(
    session_factory: async_sessionmaker[AsyncSession],
    metrics: NotificationWorkerMetrics,
    database_metrics: DatabaseMetricInstruments,
) -> None:
    now = datetime.now(UTC).replace(tzinfo=None)
    async with session_factory() as session:
        await acquire_session_connection(session, database_metrics)
        row = (
            (
                await session.execute(
                    text(
                        '''SELECT
                      COUNT(*) FILTER (WHERE "attempts" < 5 AND "availableAt" <= :now AND (
                        "status" IN ('PENDING', 'FAILED') OR
                        ("status" = 'PROCESSING' AND
                          ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= :now))
                      )) AS pending,
                      COUNT(*) FILTER (WHERE "status" = 'FAILED' AND "attempts" >= 5)
                        AS terminal_failed,
                      COALESCE(GREATEST(EXTRACT(EPOCH FROM (:now - MIN("createdAt") FILTER
                        (WHERE "attempts" < 5 AND "availableAt" <= :now AND (
                          "status" IN ('PENDING', 'FAILED') OR
                          ("status" = 'PROCESSING' AND
                            ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= :now))
                        )))), 0), 0) AS oldest_age_seconds,
                      COUNT(*) FILTER (WHERE "status" = 'PROCESSING' AND
                        ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= :now)) AS expired_leases
                    FROM "notification_outbox"'''
                    ),
                    {"now": now},
                )
            )
            .mappings()
            .one()
        )
        last_success = await session.scalar(
            text(
                """SELECT COALESCE(EXTRACT(EPOCH FROM MAX("lastSucceededAt")), 0)
                   FROM "scheduled_alert_runs" WHERE "key" = 'scheduled-alerts'"""
            )
        )
    _metric_call(
        lambda: metrics.update_outbox_snapshot(
            pending=int(row["pending"] or 0),
            oldest_age_seconds=float(row["oldest_age_seconds"] or 0),
            terminal_failed=int(row["terminal_failed"] or 0),
            expired_leases=int(row["expired_leases"] or 0),
            generation_last_success_timestamp_seconds=float(last_success or 0),
        )
    )


async def _run_with_resources(
    stop: asyncio.Event,
    engine: AsyncEngine,
    session_factory: async_sessionmaker[AsyncSession],
    uow_factory: UnitOfWorkFactory[UnitOfWork],
    worker_metrics: NotificationWorkerMetrics | None,
    tracer: api_trace.Tracer,
    database_metrics: DatabaseMetricInstruments,
) -> None:
    sender = SmtpOutboxSender(session_factory, tracer, database_metrics)
    context = RequestContext(request_id="notification-worker")

    async def process_email() -> object:
        async with trace_async_operation(tracer, "service.outbox.process"):
            if await sender.settings() is None:
                return {"sent": 0, "failed": 0, "skipped": 0}
            return await process_outbox(sender, uow_factory)

    async def process_alerts() -> object:
        async with trace_async_operation(tracer, "service.scheduled_alerts.generate"):
            generation_context = ScheduledAlertContext(
                request=context,
                run_lock=SqlAlchemyScheduledAlertLock(engine),
                queries=SqlAlchemyScheduledAlertQueries(session_factory),
                uow_factory=uow_factory,
            )
            return await run_scheduled_alerts(generation_context)

    async def update_snapshot() -> None:
        if worker_metrics is None:
            return
        await _update_snapshot(session_factory, worker_metrics, database_metrics)

    await run_notification_worker(
        stop, process_email, process_alerts, worker_metrics, update_snapshot
    )


async def _shutdown_provider(
    provider: TracerProvider | MeterProvider | None,
    name: str,
    timeout_seconds: float,
) -> None:
    if provider is None:
        return
    try:
        async with asyncio.timeout(timeout_seconds):
            await asyncio.to_thread(provider.shutdown)
    except Exception as error:
        logger.error("Notification worker %s shutdown failed (%s)", name, type(error).__name__)


async def _main() -> None:
    settings = Settings()
    try:
        observability = create_observability(
            settings, service_name="organization-erp-notification-worker"
        )
    except Exception as error:
        logger.error("Notification worker observability unavailable (%s)", type(error).__name__)
        service_name = "organization-erp-notification-worker"
        observability = ObservabilityRuntime(
            None,
            None,
            api_trace.get_tracer(service_name),
            api_metrics.get_meter(service_name),
        )
    try:
        worker_metrics: NotificationWorkerMetrics | None = NotificationWorkerMetrics(
            observability.meter
        )
    except Exception as error:
        logger.error("Notification worker metrics unavailable (%s)", type(error).__name__)
        worker_metrics = None
    engine = create_engine(settings)
    session_factory = create_session_factory(engine)
    database_metrics = create_database_metric_instruments(observability.meter)
    install_sqlalchemy_observability(engine, observability.tracer, database_metrics)
    uow_factory = create_unit_of_work_factory(
        session_factory,
        observability.tracer,
        lambda duration, outcome: record_pool_wait(database_metrics, duration, outcome),
    )
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)
    try:
        await _run_with_resources(
            stop,
            engine,
            session_factory,
            uow_factory,
            worker_metrics,
            observability.tracer,
            database_metrics,
        )
    finally:
        try:
            await engine.dispose()
        finally:
            await _shutdown_provider(
                observability.tracer_provider,
                "tracer provider",
                settings.otel_shutdown_timeout_seconds,
            )
            await _shutdown_provider(
                observability.meter_provider,
                "meter provider",
                settings.otel_shutdown_timeout_seconds,
            )


def main() -> None:
    asyncio.run(_main())


if __name__ == "__main__":
    main()
