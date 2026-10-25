
import pytest
from sqlalchemy import select

from app.domain.errors import DomainError
from app.integrations.session_security import SessionTokenManager
from app.models.sessions import UserSession
from app.services.auth import utc_now
from app.services.sessions import SessionsService


@pytest.mark.anyio
async def test_session_persists_only_hash_and_logout_revokes_it(auth_env):
    user_id = await auth_env["seed"]()
    service = SessionsService(auth_env["factory"], auth_env["auth"], SessionTokenManager())

    login = await service.login(user_id, "Stage03-password!")
    assert login is not None
    credentials, raw_token = login
    assert credentials.id == user_id

    async with auth_env["sessions"]() as session:
        stored = await session.scalar(
            select(UserSession).where(UserSession.userId == user_id)
        )
    assert stored is not None
    assert stored.tokenHash != raw_token
    assert len(stored.tokenHash) == 64
    assert stored.expiresAt > utc_now()
    actor = await service.resolve(raw_token)
    assert actor.actor_id == user_id

    await service.logout(raw_token)
    with pytest.raises(DomainError) as error:
        await service.resolve(raw_token)
    assert error.value.status_code == 401


@pytest.mark.anyio
async def test_password_change_invalidates_every_existing_session(auth_env):
    user_id = await auth_env["seed"]()
    service = SessionsService(auth_env["factory"], auth_env["auth"], SessionTokenManager())
    first = await service.login(user_id, "Stage03-password!")
    second = await service.login(user_id, "Stage03-password!")
    assert first is not None and second is not None
    assert first[1] != second[1]
    actor = await service.resolve(first[1])

    from app.core.context import RequestContext

    await auth_env["users"].change_password(
        "Stage03-password!", "Stage14B-new-password!", RequestContext("stage14b", actor=actor)
    )

    for token in (first[1], second[1]):
        with pytest.raises(DomainError) as error:
            await service.resolve(token)
        assert error.value.status_code == 401


@pytest.mark.anyio
async def test_inactive_and_forced_password_users_are_resolved_by_python(auth_env):
    service = SessionsService(auth_env["factory"], auth_env["auth"], SessionTokenManager())
    forced_id = await auth_env["seed"](forced=True)
    forced = await service.login(forced_id, "Stage03-password!")
    assert forced is not None
    assert (await service.resolve(forced[1])).must_change_password is True

    inactive_id = await auth_env["seed"]()
    inactive = await service.login(inactive_id, "Stage03-password!")
    assert inactive is not None
    async with auth_env["factory"]() as uow:
        await uow.users.update_auth(inactive_id, {"isActive": False})
        await uow.commit()

    with pytest.raises(DomainError) as error:
        await service.resolve(inactive[1])
    assert error.value.status_code == 401


@pytest.mark.anyio
async def test_role_assignment_change_invalidates_an_existing_session(auth_env):
    from app.core.context import RequestContext

    admin_id = await auth_env["seed"]()
    subject_id = await auth_env["seed"]()
    admin = await auth_env["auth"].resolve_actor(admin_id, 1)
    service = SessionsService(auth_env["factory"], auth_env["auth"], SessionTokenManager())
    login = await service.login(subject_id, "Stage03-password!")
    assert login is not None

    await auth_env["users"].update(
        subject_id,
        {
            "assignments": [
                {
                    "role": "AUDITOR",
                    "departmentScopeMode": "ALL",
                    "projectScopeMode": "ALL",
                    "departmentIds": [],
                    "projectIds": [],
                }
            ]
        },
        RequestContext("stage14b-role-change", actor=admin),
    )

    with pytest.raises(DomainError) as error:
        await service.resolve(login[1])
    assert error.value.status_code == 401
