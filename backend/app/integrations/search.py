"""SQLAlchemy adapter for the global search port."""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.auth.rules import AccessContext
from app.repositories.search import SqlAlchemySearchRepository


class SqlAlchemySearchGateway:
    def __init__(self, sessions: async_sessionmaker[AsyncSession]) -> None:
        self._sessions = sessions

    async def search(self, query: str, access: AccessContext) -> list[dict[str, str]]:
        async with self._sessions() as session:
            return await SqlAlchemySearchRepository(session).search(query, access)
