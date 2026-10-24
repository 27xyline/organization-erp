from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.domain.auth.rules import AccessContext
from app.repositories.reporting import SqlAlchemyReportingRepository


class MyActionsService:
    def __init__(self, session_factory: async_sessionmaker[Any]) -> None:
        self._session_factory = session_factory

    async def get_for_user(
        self,
        actor_id: str,
        employee_id: str | None,
        access: AccessContext,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        async with self._session_factory() as session:
            return await SqlAlchemyReportingRepository(session).my_actions(
                actor_id, employee_id, access, now or datetime.utcnow()
            )
