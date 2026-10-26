"""Адаптер SQLAlchemy для сценариев отчётности."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.auth.rules import AccessContext
from app.repositories.reporting import SqlAlchemyReportingRepository


class SqlAlchemyReportingGateway:
    """Управляет жизненным циклом сессии, не допуская SQLAlchemy в сервисы."""

    def __init__(self, sessions: async_sessionmaker[AsyncSession]) -> None:
        self._sessions = sessions

    async def dashboard(
        self, query: dict[str, str | None], access: AccessContext, now: datetime
    ) -> dict[str, Any]:
        async with self._sessions() as session:
            return await SqlAlchemyReportingRepository(session).dashboard(query, access, now)

    async def turnover(
        self,
        date_from: datetime,
        date_to: datetime,
        department_id: str | None,
        access: AccessContext,
    ) -> dict[str, Any]:
        async with self._sessions() as session:
            return await SqlAlchemyReportingRepository(session).turnover(
                date_from, date_to, department_id, access
            )

    async def profitability(
        self, date_from: datetime, date_to: datetime, project_id: str | None, access: AccessContext
    ) -> list[dict[str, Any]]:
        async with self._sessions() as session:
            return await SqlAlchemyReportingRepository(session).profitability(
                date_from, date_to, project_id, access
            )

    async def depreciation(
        self,
        date_from: datetime,
        date_to: datetime,
        department_id: str | None,
        access: AccessContext,
    ) -> dict[str, Any]:
        async with self._sessions() as session:
            return await SqlAlchemyReportingRepository(session).depreciation(
                date_from, date_to, department_id, access
            )

    async def vacation_calendar(
        self,
        date_from: datetime,
        date_to: datetime,
        department_id: str | None,
        access: AccessContext,
    ) -> list[dict[str, Any]]:
        async with self._sessions() as session:
            return await SqlAlchemyReportingRepository(session).vacation_calendar(
                date_from, date_to, department_id, access
            )

    async def custom_report(
        self,
        group_by: str,
        metrics: list[str],
        date_from: datetime,
        date_to: datetime,
        department_id: str | None,
        project_id: str | None,
        access: AccessContext,
    ) -> list[dict[str, Any]]:
        async with self._sessions() as session:
            return await SqlAlchemyReportingRepository(session).custom_report(
                group_by, list(metrics), date_from, date_to, department_id, project_id, access
            )

    async def list_presets(self, user_id: str) -> list[dict[str, Any]]:
        async with self._sessions() as session:
            return await SqlAlchemyReportingRepository(session).list_presets(user_id)

    async def save_preset(self, user_id: str, body: dict[str, Any]) -> dict[str, Any]:
        async with self._sessions.begin() as session:
            return await SqlAlchemyReportingRepository(session).save_preset(user_id, body)

    async def delete_preset(self, user_id: str, preset_id: str) -> bool:
        async with self._sessions.begin() as session:
            return await SqlAlchemyReportingRepository(session).delete_preset(user_id, preset_id)
