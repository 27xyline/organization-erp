from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True, slots=True)
class SessionRecord:
    user_id: str
    session_version: int
    expires_at: datetime
    revoked_at: datetime | None


class SessionRepository(Protocol):
    async def create(
        self, user_id: str, session_version: int, token_hash: str, expires_at: datetime
    ) -> None: ...
    async def by_token_hash(self, token_hash: str) -> SessionRecord | None: ...
    async def revoke(self, token_hash: str, revoked_at: datetime) -> None: ...
