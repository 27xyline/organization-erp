from __future__ import annotations

from dataclasses import dataclass

from opentelemetry import metrics, trace
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.trace import TracerProvider
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.metrics import DatabaseMetricInstruments, HttpMetricInstruments
from app.domain.ports.smtp import SmtpVerifier
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory


@dataclass(slots=True)
class AppResources:
    engine: AsyncEngine
    session_factory: async_sessionmaker[AsyncSession]
    unit_of_work_factory: UnitOfWorkFactory[UnitOfWork]
    smtp_verifier: SmtpVerifier
    tracer_provider: TracerProvider | None
    meter_provider: MeterProvider | None
    tracer: trace.Tracer
    meter: metrics.Meter
    http_metric_instruments: HttpMetricInstruments
    database_metric_instruments: DatabaseMetricInstruments
