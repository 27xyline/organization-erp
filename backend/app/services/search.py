"""Global search use case."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.auth.rules import AccessContext
from app.repositories.search import SqlAlchemySearchRepository


class SearchService:
    def __init__(self, session: AsyncSession) -> None:
        self.repository = SqlAlchemySearchRepository(session)

    async def search(self, query: str, access: AccessContext) -> list[dict[str, str]]:
        normalized = query.strip()
        if len(normalized) < 2 or len(normalized) > 100:
            return []
        return await self.repository.search(normalized, access)
