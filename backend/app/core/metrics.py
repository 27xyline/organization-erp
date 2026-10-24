from __future__ import annotations

import time
from collections.abc import Iterable
from dataclasses import dataclass
from threading import RLock
from typing import Any

from opentelemetry import trace
from opentelemetry.metrics import CallbackOptions, Counter, Histogram, Meter, Observation
from opentelemetry.trace import Span, SpanKind, Status, StatusCode
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.metric_attributes import http_metric_attributes, sql_operation


@dataclass(frozen=True, slots=True)
class HttpMetricInstruments:
    request_count: Counter
    request_duration: Histogram


@dataclass(frozen=True, slots=True)
class DatabaseMetricInstruments:
    query_count: Counter
    query_duration: Histogram
    pool_wait: Histogram


class NotificationWorkerMetrics:
    """Bounded worker counters and gauges backed by the latest database snapshot."""

    def __init__(self, meter: Meter) -> None:
        self._lock = RLock()
        self._heartbeat_timestamp = 0.0
        self._outbox_pending = 0
        self._outbox_oldest_age_seconds = 0.0
        self._outbox_terminal_failed = 0
        self._outbox_expired_leases = 0
        self._generation_last_success = 0.0
        self.jobs = meter.create_counter(
            "erp_notification_worker_jobs_total", description="Notification worker job results"
        )
        self.generation_failures = meter.create_counter(
            "erp_notification_generation_failures_total",
            description="Scheduled notification generation failures",
        )
        meter.create_observable_gauge(
            "erp_notification_worker_heartbeat_timestamp_seconds",
            callbacks=[self._observe_heartbeat],
            unit="s",
        )
        meter.create_observable_gauge(
            "erp_notification_outbox_pending", callbacks=[self._observe_pending]
        )
        meter.create_observable_gauge(
            "erp_notification_outbox_oldest_age_seconds",
            callbacks=[self._observe_oldest_age],
            unit="s",
        )
        meter.create_observable_gauge(
            "erp_notification_outbox_terminal_failed", callbacks=[self._observe_terminal_failed]
        )
        meter.create_observable_gauge(
            "erp_notification_outbox_expired_leases", callbacks=[self._observe_expired_leases]
        )
        meter.create_observable_gauge(
            "erp_notification_generation_last_success_timestamp_seconds",
            callbacks=[self._observe_generation_success],
            unit="s",
        )

    def heartbeat(self, timestamp_seconds: float | None = None) -> None:
        with self._lock:
            self._heartbeat_timestamp = timestamp_seconds or time.time()

    def record_job(self, job: str, succeeded: bool) -> None:
        bounded_job = job if job in {"outbox", "scheduled_alerts"} else "other"
        outcome = "success" if succeeded else "error"
        self.jobs.add(1, {"job": bounded_job, "outcome": outcome})
        if bounded_job == "scheduled_alerts" and not succeeded:
            self.generation_failures.add(1)

    def update_outbox_snapshot(
        self,
        *,
        pending: int,
        oldest_age_seconds: float,
        terminal_failed: int,
        expired_leases: int,
        generation_last_success_timestamp_seconds: float,
    ) -> None:
        with self._lock:
            self._outbox_pending = max(pending, 0)
            self._outbox_oldest_age_seconds = max(oldest_age_seconds, 0.0)
            self._outbox_terminal_failed = max(terminal_failed, 0)
            self._outbox_expired_leases = max(expired_leases, 0)
            self._generation_last_success = max(generation_last_success_timestamp_seconds, 0.0)

    def _observe_heartbeat(self, options: CallbackOptions) -> Iterable[Observation]:
        del options
        with self._lock:
            return (Observation(self._heartbeat_timestamp),)

    def _observe_pending(self, options: CallbackOptions) -> Iterable[Observation]:
        del options
        with self._lock:
            return (Observation(self._outbox_pending),)

    def _observe_oldest_age(self, options: CallbackOptions) -> Iterable[Observation]:
        del options
        with self._lock:
            return (Observation(self._outbox_oldest_age_seconds),)

    def _observe_terminal_failed(self, options: CallbackOptions) -> Iterable[Observation]:
        del options
        with self._lock:
            return (Observation(self._outbox_terminal_failed),)

    def _observe_expired_leases(self, options: CallbackOptions) -> Iterable[Observation]:
        del options
        with self._lock:
            return (Observation(self._outbox_expired_leases),)

    def _observe_generation_success(self, options: CallbackOptions) -> Iterable[Observation]:
        del options
        with self._lock:
            return (Observation(self._generation_last_success),)


def create_http_metric_instruments(meter: Meter) -> HttpMetricInstruments:
    return HttpMetricInstruments(
        request_count=meter.create_counter(
            "erp_http_requests_total", description="HTTP requests completed"
        ),
        request_duration=meter.create_histogram(
            "erp_http_request_duration_seconds",
            unit="s",
            description="HTTP request duration",
        ),
    )


def create_database_metric_instruments(meter: Meter) -> DatabaseMetricInstruments:
    return DatabaseMetricInstruments(
        query_count=meter.create_counter(
            "erp_db_queries_total", description="PostgreSQL statements completed"
        ),
        query_duration=meter.create_histogram(
            "erp_db_query_duration_seconds", unit="s", description="SQL statement duration"
        ),
        pool_wait=meter.create_histogram(
            "erp_db_pool_wait_seconds", unit="s", description="Time waiting for a DB connection"
        ),
    )


def record_pool_wait(
    instruments: DatabaseMetricInstruments, duration_seconds: float, outcome: str
) -> None:
    label = outcome if outcome in {"success", "error"} else "error"
    instruments.pool_wait.record(max(duration_seconds, 0.0), {"outcome": label})


def record_http_request(
    instruments: HttpMetricInstruments,
    method: str,
    route: object,
    status_code: int,
    duration_seconds: float,
) -> None:
    attributes = http_metric_attributes(method, route, status_code)
    instruments.request_count.add(1, attributes)
    instruments.request_duration.record(max(duration_seconds, 0.0), attributes)


async def acquire_session_connection(
    session: AsyncSession, instruments: DatabaseMetricInstruments
) -> None:
    """Measure connection acquisition, including time waiting for the SQLAlchemy pool."""
    started = time.perf_counter()
    outcome = "success"
    try:
        await session.connection()
    except BaseException:
        outcome = "error"
        raise
    finally:
        record_pool_wait(instruments, time.perf_counter() - started, outcome)


@dataclass(slots=True)
class _QueryObservation:
    started_at: float
    operation: str
    span: Span
    span_manager: Any


def install_sqlalchemy_observability(
    engine: AsyncEngine, tracer: trace.Tracer, instruments: DatabaseMetricInstruments
) -> None:
    """Record bounded query metadata and spans; never retain SQL or bind parameters."""
    active: dict[int, _QueryObservation] = {}
    active_lock = RLock()

    def take(context: object | None) -> _QueryObservation | None:
        if context is None:
            return None
        with active_lock:
            return active.pop(id(context), None)

    def before_cursor_execute(
        connection: object,
        cursor: object,
        statement: str,
        parameters: object,
        context: object | None,
        executemany: bool,
    ) -> None:
        del connection, cursor, parameters, executemany
        operation = sql_operation(statement)
        span_manager = tracer.start_as_current_span(
            f"db.{operation.lower()}",
            kind=SpanKind.CLIENT,
            attributes={
                "db.system": "postgresql",
                "db.system.name": "postgresql",
                "db.operation.name": operation,
            },
            record_exception=False,
            set_status_on_exception=False,
        )
        span = span_manager.__enter__()
        observation = _QueryObservation(time.perf_counter(), operation, span, span_manager)
        if context is not None:
            with active_lock:
                active[id(context)] = observation

    def finish(context: object | None, *, failed: bool) -> None:
        observation = take(context)
        if observation is None:
            return
        elapsed = max(time.perf_counter() - observation.started_at, 0.0)
        attributes = {
            "db.system.name": "postgresql",
            "db.operation.name": observation.operation,
            "outcome": "error" if failed else "success",
        }
        instruments.query_count.add(1, attributes)
        instruments.query_duration.record(elapsed, attributes)
        if failed:
            observation.span.set_status(Status(StatusCode.ERROR))
        observation.span_manager.__exit__(None, None, None)

    def after_cursor_execute(
        connection: object,
        cursor: object,
        statement: str,
        parameters: object,
        context: object | None,
        executemany: bool,
    ) -> None:
        del connection, cursor, statement, parameters, executemany
        finish(context, failed=False)

    def handle_error(exception_context: object) -> None:
        execution_context = getattr(exception_context, "execution_context", None)
        if execution_context is None:
            return
        observation = take(execution_context)
        if observation is None:
            return
        elapsed = max(time.perf_counter() - observation.started_at, 0.0)
        attributes = {
            "db.system.name": "postgresql",
            "db.operation.name": observation.operation,
            "outcome": "error",
        }
        instruments.query_count.add(1, attributes)
        instruments.query_duration.record(elapsed, attributes)
        observation.span.set_status(Status(StatusCode.ERROR))
        observation.span_manager.__exit__(None, None, None)

    sync_engine = engine.sync_engine
    event.listen(sync_engine, "before_cursor_execute", before_cursor_execute)
    event.listen(sync_engine, "after_cursor_execute", after_cursor_execute)
    event.listen(sync_engine, "handle_error", handle_error)
