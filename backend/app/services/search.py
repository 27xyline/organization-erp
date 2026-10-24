"""Global search use case."""

from app.domain.auth.rules import AccessContext
from app.domain.ports.search import SearchPort


class SearchService:
    def __init__(self, search_port: SearchPort) -> None:
        self.search_port = search_port

    async def search(self, query: str, access: AccessContext) -> list[dict[str, str]]:
        normalized = query.strip()
        if len(normalized) < 2 or len(normalized) > 100:
            return []
        return await self.search_port.search(normalized, access)
