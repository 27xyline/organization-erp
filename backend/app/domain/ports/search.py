"""Persistence port for permission-scoped global search."""

from typing import Protocol

from app.domain.auth.rules import AccessContext


class SearchPort(Protocol):
    async def search(self, query: str, access: AccessContext) -> list[dict[str, str]]: ...
