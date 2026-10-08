from __future__ import annotations

from dataclasses import dataclass

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory


@dataclass(slots=True)
class AppResources:
    engine: AsyncEngine
    session_factory: async_sessionmaker[AsyncSession]
    unit_of_work_factory: UnitOfWorkFactory[UnitOfWork]
    tracer_provider: TracerProvider | None
    tracer: trace.Tracer
