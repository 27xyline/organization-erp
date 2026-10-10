import asyncio
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select, update

from app.domain.errors import DomainError
from app.models.users import User
from app.services.auth import AuthService
from tests.auth_support import PASSWORD


@pytest.mark.anyio
async def test_five_concurrent_failures_lock_exactly_fifteen_minutes_and_expiry_resets(auth_env):
    env = auth_env
    identifier = await env["seed"]()
    now = datetime(2026, 10, 10, 12, 0)
    auth = AuthService(env["factory"], env["passwords"], lambda: now)
    results = await asyncio.gather(
        *(auth.authenticate_credentials(identifier, "wrong") for _ in range(5))
    )
    assert results == [None] * 5
    async with env["sessions"]() as session:
        user = await session.get(User, identifier)
        assert user.failedLoginAttempts == 5
        assert user.lockedUntil == now + timedelta(minutes=15)
    assert await auth.authenticate_credentials(identifier, PASSWORD) is None
    expired = AuthService(env["factory"], env["passwords"], lambda: now + timedelta(minutes=15))
    assert await expired.authenticate_credentials(identifier, "wrong") is None
    async with env["sessions"]() as session:
        user = await session.get(User, identifier)
        assert user.failedLoginAttempts == 1
        assert user.lockedUntil is None
    result = await expired.authenticate_credentials("  " + identifier.upper() + " ", PASSWORD)
    assert result.id == identifier and result.sessionVersion == 1
    async with env["sessions"]() as session:
        user = await session.get(User, identifier)
        assert user.failedLoginAttempts == 0 and user.lockedUntil is None
        assert user.lastLoginAt == now + timedelta(minutes=15)


@pytest.mark.anyio
async def test_unknown_inactive_and_wrong_password_have_same_result_and_version_is_fresh(auth_env):
    env = auth_env
    inactive = await env["seed"](active=False)
    active = await env["seed"]()
    for name in ("missing-" + env["prefix"], inactive, active):
        assert await env["auth"].authenticate_credentials(name, "wrong") is None
    actor = await env["auth"].resolve_actor(active, 1)
    assert actor.actor_id == active and "access.users.create" in actor.permissions
    async with env["sessions"]() as session:
        await session.execute(update(User).where(User.id == active).values(sessionVersion=2))
        await session.commit()
    for identifier in (active, inactive):
        with pytest.raises(DomainError) as error:
            await env["auth"].resolve_actor(identifier, 1)
        assert error.value.code == "UNAUTHENTICATED"


@pytest.mark.anyio
async def test_concurrent_success_and_failures_have_serializable_counter_result(auth_env):
    env = auth_env
    identifier = await env["seed"]()
    results = await asyncio.gather(
        env["auth"].authenticate_credentials(identifier, PASSWORD),
        *(env["auth"].authenticate_credentials(identifier, "wrong") for _ in range(4)),
    )
    assert results[0] is not None
    async with env["sessions"]() as session:
        count = await session.scalar(select(User.failedLoginAttempts).where(User.id == identifier))
    assert 0 <= count <= 4
