"""SQLAlchemy transaction adapter for the audit port."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.ports.audit import AuditRecord
from app.repositories.audit import SqlAlchemyAuditRepository


class SqlAlchemyAuditGateway:
    def __init__(self, sessions: async_sessionmaker[AsyncSession]) -> None:
        self._sessions = sessions

    async def append(self, record: AuditRecord) -> None:
        async with self._sessions.begin() as session:
            await SqlAlchemyAuditRepository(lambda: session).append(record)
