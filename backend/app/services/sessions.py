from collections.abc import Callable
from datetime import datetime, timedelta

from app.core.context import Actor
from app.domain.errors import DomainError
from app.domain.ports.sessions import SessionTokenPort
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.services.auth import AuthService, utc_now
from app.services.dto.auth import CredentialResult


class SessionsService:
    def __init__(
        self,
        uow_factory: UnitOfWorkFactory[UnitOfWork],
        auth: AuthService,
        token_port: SessionTokenPort,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self._uow_factory = uow_factory
        self._auth = auth
        self._token_port = token_port
        self._clock = clock

    async def login(self, username: str, password: str) -> tuple[CredentialResult, str] | None:
        credentials = await self._auth.authenticate_credentials(username, password)
        if credentials is None:
            return None
        token = self._token_port.new_token()
        async with self._uow_factory() as uow:
            await uow.sessions.create(
                credentials.id,
                credentials.sessionVersion,
                self._token_port.hash_token(token),
                self._clock() + timedelta(hours=8),
            )
            await uow.commit()
        return credentials, token

    async def resolve(self, token: str) -> Actor:
        now = self._clock()
        async with self._uow_factory() as uow:
            session = await uow.sessions.by_token_hash(self._token_port.hash_token(token))
        if session is None or session.revoked_at is not None or session.expires_at <= now:
            raise self._unauthenticated()
        return await self._auth.resolve_actor(session.user_id, session.session_version)

    async def logout(self, token: str | None) -> None:
        if not token:
            return
        async with self._uow_factory() as uow:
            await uow.sessions.revoke(self._token_port.hash_token(token), self._clock())
            await uow.commit()

    @staticmethod
    def _unauthenticated() -> DomainError:
        return DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)
