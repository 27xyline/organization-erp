"""Адаптер SMTP для отделённых данных outbox."""

from __future__ import annotations

from typing import Any

from opentelemetry.trace import Tracer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.metrics import DatabaseMetricInstruments, acquire_session_connection
from app.domain.ports.smtp import SmtpCredentials
from app.integrations.smtp import send_smtp_async
from app.models.employees import Employee
from app.models.notifications import SmtpSettings
from app.models.users import User


class SmtpOutboxSender:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        tracer: Tracer | None = None,
        database_metrics: DatabaseMetricInstruments | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._tracer = tracer
        self._database_metrics = database_metrics

    async def settings(self) -> SmtpCredentials | None:
        async with self._session_factory() as session:
            if self._database_metrics is not None:
                await acquire_session_connection(session, self._database_metrics)
            row = await session.get(SmtpSettings, "singleton")
            if row is None:
                return None
            return SmtpCredentials(
                row.host, row.port, row.username, row.password, row.secure, row.fromEmail
            )

    async def send(self, payload: dict[str, Any]) -> None:
        settings = await self.settings()
        if settings is None:
            raise RuntimeError("SMTP_SETTINGS_NOT_CONFIGURED")
        async with self._session_factory() as session:
            if self._database_metrics is not None:
                await acquire_session_connection(session, self._database_metrics)
            row = (
                await session.execute(
                    select(User.username, Employee.email)
                    .outerjoin(Employee, User.employeeId == Employee.id)
                    .where(User.id == payload["userId"])
                )
            ).first()
        if row is None:
            raise RuntimeError("RECIPIENT_NOT_FOUND")
        recipient = row.email or (row.username if "@" in row.username else None)
        if recipient is None:
            raise RuntimeError("RECIPIENT_EMAIL_MISSING")
        await send_smtp_async(
            settings, recipient, str(payload["title"]), str(payload["body"]), self._tracer
        )
