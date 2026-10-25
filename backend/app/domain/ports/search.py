"Порт хранения для глобального поиска с учётом разрешений."

from typing import Protocol

from app.domain.auth.rules import AccessContext


class SearchPort(Protocol):
    async def search(self, query: str, access: AccessContext) -> list[dict[str, str]]: ...
