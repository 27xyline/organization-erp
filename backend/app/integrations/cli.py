"""Session-owning SQLAlchemy adapters for operational CLI ports."""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.ports.cli import VerifyDataSnapshot
from app.repositories.cli import SqlAlchemyVerifyDataRepository


class SqlAlchemyVerifyDataGateway:
    def __init__(self, sessions: async_sessionmaker[AsyncSession]) -> None:
        self._sessions = sessions

    async def verify_data(self) -> VerifyDataSnapshot:
        async with self._sessions() as session:
            return await SqlAlchemyVerifyDataRepository(session).verify_data()
