from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.domain.errors import DomainError
from app.integrations.session_security import SessionTokenManager
from app.services.sessions import SessionsService


class FakeSessions:
    def __init__(self) -> None:
        self.rows = {}

    async def create(self, user_id, session_version, token_hash, expires_at) -> None:
        self.rows[token_hash] = SimpleNamespace(
            user_id=user_id, session_version=session_version, expires_at=expires_at, revoked_at=None
        )

    async def by_token_hash(self, token_hash):
        return self.rows.get(token_hash)

    async def revoke(self, token_hash, revoked_at) -> None:
        if token_hash in self.rows:
            self.rows[token_hash].revoked_at = revoked_at


class FakeUow:
    def __init__(self, sessions) -> None:
        self.sessions = sessions
        self.committed = False

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def commit(self) -> None:
        self.committed = True


class FakeAuth:
    async def authenticate_credentials(self, username, password):
        return SimpleNamespace(id="u1", sessionVersion=4) if password == "ok" else None

    async def resolve_actor(self, user_id, session_version):
        if session_version != 4:
            raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)
        return SimpleNamespace(actor_id=user_id, session_version=session_version)


@pytest.mark.anyio
async def test_login_persists_only_hash_with_eight_hour_expiry_and_resolves_actor() -> None:
    now = datetime(2026, 10, 24, tzinfo=UTC).replace(tzinfo=None)
    sessions = FakeSessions()
    service = SessionsService(
        lambda: FakeUow(sessions), FakeAuth(), SessionTokenManager(), clock=lambda: now
    )

    result = await service.login("person", "ok")

    assert result is not None
    credentials, raw_token = result
    assert raw_token not in sessions.rows
    assert len(sessions.rows) == 1
    stored = next(iter(sessions.rows.values()))
    assert stored.expires_at == now + timedelta(hours=8)
    actor = await service.resolve(raw_token)
    assert actor.actor_id == credentials.id == "u1"


@pytest.mark.anyio
async def test_expired_or_revoked_sessions_are_rejected() -> None:
    now = datetime(2026, 10, 24, tzinfo=UTC).replace(tzinfo=None)
    sessions = FakeSessions()
    service = SessionsService(
        lambda: FakeUow(sessions), FakeAuth(), SessionTokenManager(), clock=lambda: now
    )
    created = await service.login("person", "ok")
    assert created is not None
    token = created[1]

    await service.logout(token)
    with pytest.raises(DomainError, match="Требуется вход"):
        await service.resolve(token)

    created = await service.login("person", "ok")
    assert created is not None
    expired_token = created[1]
    old_service = SessionsService(
        lambda: FakeUow(sessions),
        FakeAuth(),
        SessionTokenManager(),
        clock=lambda: now + timedelta(hours=9),
    )
    with pytest.raises(DomainError, match="Требуется вход"):
        await old_service.resolve(expired_token)


@pytest.mark.anyio
async def test_each_successful_login_mints_a_new_non_fixated_session_token() -> None:
    now = datetime(2026, 10, 24, tzinfo=UTC).replace(tzinfo=None)
    sessions = FakeSessions()
    service = SessionsService(
        lambda: FakeUow(sessions), FakeAuth(), SessionTokenManager(), clock=lambda: now
    )

    first = await service.login("person", "ok")
    second = await service.login("person", "ok")

    assert first is not None and second is not None
    assert first[1] != second[1]
    assert len(sessions.rows) == 2
