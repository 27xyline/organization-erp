"""Concurrency-safe scheduled alert runner and legacy-compatible generation."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.core.context import RequestContext
from app.domain.ports.scheduled_alerts import ScheduledAlertQueries, ScheduledAlertRunPort
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.services.dto.scheduled_alerts import AlertResult

HOUR = timedelta(hours=1)
RETRY_GAP = timedelta(minutes=5)


AlertGenerator = Callable[[datetime, RequestContext], Awaitable[AlertResult]]


@dataclass(frozen=True, slots=True)
class ScheduledAlertContext:
    request: RequestContext
    run_lock: ScheduledAlertRunPort
    queries: ScheduledAlertQueries
    uow_factory: UnitOfWorkFactory[UnitOfWork]
    generator: AlertGenerator | None = None


def should_run(
    now: datetime,
    last_started: datetime | None,
    last_succeeded: datetime | None,
    *,
    force: bool = False,
) -> bool:
    if force:
        return True
    recently_succeeded = last_succeeded is not None and now - last_succeeded < HOUR
    recently_attempted = last_started is not None and now - last_started < RETRY_GAP
    return not (recently_succeeded or recently_attempted)


async def run_scheduled_alerts(
    context: ScheduledAlertContext,
    *,
    force: bool = False,
    now: datetime | None = None,
) -> AlertResult:
    timestamp = now or datetime.now(UTC).replace(tzinfo=None)
    lock = context.run_lock
    async with lock.hold() as connection:
        if connection is None:
            return AlertResult(ran=False, sources={})
        last_started, last_succeeded = await lock.state(connection)
        if not should_run(timestamp, last_started, last_succeeded, force=force):
            return AlertResult(ran=False, sources={})
        await lock.started(connection, timestamp)
        try:
            generated = await _resolve_generator(context)(timestamp, context.request)
            await lock.succeeded(connection, timestamp)
            return AlertResult(
                ran=True,
                generated=generated.generated,
                email_queued=generated.email_queued,
                sources=generated.sources or {},
            )
        except Exception as error:
            await lock.failed(connection, timestamp, type(error).__name__)
            raise


async def generate_scheduled_alerts(
    uow_factory: UnitOfWorkFactory[UnitOfWork],
    queries: ScheduledAlertQueries,
    now: datetime,
    context: RequestContext,
) -> AlertResult:
    """Generate scheduled alerts from legacy source records and persist via intents."""
    # Implemented in a separate collector so the scheduler owns only the lock lifecycle.
    from app.services.scheduled_alert_generation import collect_scheduled_alerts

    return await collect_scheduled_alerts(uow_factory, queries, now, context)


def _resolve_generator(context: ScheduledAlertContext) -> AlertGenerator:
    if context.generator is not None:
        return context.generator

    async def generate(now: datetime, request: RequestContext) -> AlertResult:
        return await generate_scheduled_alerts(context.uow_factory, context.queries, now, request)

    return generate
