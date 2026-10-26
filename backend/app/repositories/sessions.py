from collections.abc import Callable
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.ports.sessions import SessionRecord
from app.models.sessions import UserSession


class SqlAlchemySessionRepository:
    def __init__(self, session: Callable[[], AsyncSession]) -> None:
        self._session = session

    async def create(
        self, user_id: str, session_version: int, token_hash: str, expires_at: datetime
    ) -> None:
        self._session().add(
            UserSession(
                userId=user_id,
                sessionVersion=session_version,
                tokenHash=token_hash,
                expiresAt=expires_at,
            )
        )

    async def by_token_hash(self, token_hash: str) -> SessionRecord | None:
        row = await self._session().scalar(
            select(UserSession).where(UserSession.tokenHash == token_hash)
        )
        if row is None:
            return None
        return SessionRecord(row.userId, row.sessionVersion, row.expiresAt, row.revokedAt)

    async def revoke(self, token_hash: str, revoked_at: datetime) -> None:
        await self._session().execute(
            update(UserSession)
            .where(UserSession.tokenHash == token_hash, UserSession.revokedAt.is_(None))
            .values(revokedAt=revoked_at)
        )
