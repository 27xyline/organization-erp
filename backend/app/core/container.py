from __future__ import annotations

from dataclasses import dataclass

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker


@dataclass(slots=True)
class AppResources:
    engine: AsyncEngine
    session_factory: async_sessionmaker[AsyncSession]
    tracer_provider: TracerProvider | None
    tracer: trace.Tracer
