"""Адаптер SQLAlchemy для интерфейса my-actions."""

from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.auth.rules import AccessContext
from app.repositories.reporting import SqlAlchemyReportingRepository


class SqlAlchemyMyActionsGateway:
    def __init__(self, sessions: async_sessionmaker[AsyncSession]) -> None:
        self._sessions = sessions

    async def my_actions(
        self,
        actor_id: str,
        employee_id: str | None,
        access: AccessContext,
        now: datetime,
    ) -> dict[str, Any]:
        async with self._sessions() as session:
            return await SqlAlchemyReportingRepository(session).my_actions(
                actor_id, employee_id, access, now
            )
