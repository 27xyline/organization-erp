import asyncio

import pytest
from sqlalchemy import delete, func, select, update

from app.core.context import RequestContext
from app.domain.errors import DomainError
from app.domain.ports.notifications import NotificationIntent
from app.models.notifications import Notification, NotificationOutbox
from app.models.users import AuditLog, User, UserRoleAssignment
from app.services.users import UserService
from tests.auth_support import PASSWORD

ADMIN_ASSIGNMENT = {
    "role": "ADMIN",
    "departmentScopeMode": "ALL",
    "projectScopeMode": "ALL",
    "departmentIds": [],
    "projectIds": [],
}
AUDITOR_ASSIGNMENT = ADMIN_ASSIGNMENT | {"role": "AUDITOR"}


@pytest.mark.anyio
async def test_create_update_temporary_password_audit_and_credential_revocation(auth_env):
    env = auth_env
    admin_id = await env["seed"]()
    actor = await env["auth"].resolve_actor(admin_id, 1)
    context = RequestContext("user-test", actor=actor)
    username = env["prefix"] + "-created"
    user = await env["users"].create(
        {
            "username": username,
            "name": "Created user",
            "temporaryPassword": "temporary-123",
            "assignments": [ADMIN_ASSIGNMENT],
        },
        context,
    )
    env["ids"].append(user["id"])
    assert user["username"] == username and user["mustChangePassword"]
    assert "passwordHash" not in user and "sessionVersion" not in user
    assert user["roleAssignments"][0]["role"] == "ADMIN"
    credentials = await env["auth"].authenticate_credentials(username, "temporary-123")
    assert credentials.mustChangePassword and credentials.sessionVersion == 1
    current = await env["auth"].resolve_actor(user["id"], 1)
    await env["users"].change_password(
        "temporary-123", "changed-password", RequestContext("password-test", actor=current)
    )
    with pytest.raises(DomainError):
        await env["auth"].resolve_actor(user["id"], 1)
    assert (
        await env["auth"].authenticate_credentials(username, "changed-password")
    ).sessionVersion == 2
    await env["users"].update(user["id"], {"temporaryPassword": "reset-password"}, context)
    reset = await env["auth"].authenticate_credentials(username, "reset-password")
    assert reset.mustChangePassword and reset.sessionVersion == 3
    await env["users"].update(user["id"], {"assignments": [AUDITOR_ASSIGNMENT]}, context)
    with pytest.raises(DomainError):
        await env["auth"].resolve_actor(user["id"], 3)
    async with env["sessions"]() as session:
        actions = (
            await session.scalars(select(AuditLog.action).where(AuditLog.entityId == user["id"]))
        ).all()
        assert sorted(actions) == ["PASSWORD_CHANGE", "USER_CREATE", "USER_UPDATE", "USER_UPDATE"]
        assert (
            await session.scalar(
                select(func.count())
                .select_from(Notification)
                .where(Notification.userId == user["id"])
            )
            == 0
        )


@pytest.mark.anyio
async def test_reference_validation_duplicates_and_forbidden_service_call(auth_env):
    env = auth_env
    admin_id = await env["seed"]()
    actor = await env["auth"].resolve_actor(admin_id, 1)
    input = {
        "username": env["prefix"] + "-new",
        "name": "New User",
        "temporaryPassword": PASSWORD,
        "assignments": [ADMIN_ASSIGNMENT],
    }
    context = RequestContext("invalid-test", actor=actor)
    for extra, code in (
        ({"employeeId": "missing"}, "INVALID_SCOPE_REFERENCE"),
        (
            {"assignments": [ADMIN_ASSIGNMENT | {"departmentScopeMode": "SELF"}]},
            "INVALID_SCOPE_ASSIGNMENT",
        ),
        (
            {
                "assignments": [
                    ADMIN_ASSIGNMENT
                    | {
                        "role": "EMPLOYEE",
                        "departmentScopeMode": "SELF",
                        "projectScopeMode": "SELF",
                    }
                ]
            },
            "EMPLOYEE_LINK_REQUIRED",
        ),
    ):
        with pytest.raises(DomainError) as failure:
            await env["users"].create(input | extra, context)
        assert failure.value.code == code
    user = await env["users"].create(input, context)
    env["ids"].append(user["id"])
    with pytest.raises(DomainError) as duplicate:
        await env["users"].create(input, context)
    assert duplicate.value.code == "USERNAME_EXISTS"
    auditor = await env["seed"](role="AUDITOR")
    with pytest.raises(DomainError) as forbidden:
        await env["users"].list_users(1, 25, await env["auth"].resolve_actor(auditor, 1))
    assert forbidden.value.code == "FORBIDDEN"
    with pytest.raises(DomainError) as self_disable:
        await env["users"].update(admin_id, {"isActive": False}, context)
    assert self_disable.value.code == "CANNOT_DEACTIVATE_SELF"


@pytest.mark.anyio
async def test_failure_after_user_audit_and_email_intent_rolls_back_everything(auth_env):
    env = auth_env
    actor = await env["auth"].resolve_actor(await env["seed"](), 1)
    username = env["prefix"] + "-rollback"

    def failing_factory():
        uow = env["factory"]()
        original_append = uow.audit.append

        async def append_then_fail(record):
            await original_append(record)
            await uow.notifications.enqueue(
                NotificationIntent(
                    user_id=actor.actor_id,
                    event_type="SYSTEM",
                    channel="EMAIL",
                    title="rollback",
                    body="rollback",
                    dedupe_key=username,
                    payload={},
                )
            )
            raise RuntimeError("after user, audit, outbox")

        uow.audit.append = append_then_fail
        return uow

    service = UserService(failing_factory, env["passwords"])
    with pytest.raises(RuntimeError, match="after user, audit, outbox"):
        await service.create(
            {
                "username": username,
                "name": "Rollback User",
                "temporaryPassword": PASSWORD,
                "assignments": [ADMIN_ASSIGNMENT],
            },
            RequestContext("rollback-test", actor=actor),
        )
    async with env["sessions"]() as session:
        assert await session.scalar(select(User.id).where(User.username == username)) is None
        assert (
            await session.scalar(select(AuditLog.id).where(AuditLog.requestId == "rollback-test"))
            is None
        )
        assert (
            await session.scalar(select(Notification.id).where(Notification.dedupeKey == username))
            is None
        )
        assert (
            await session.scalar(
                select(NotificationOutbox.id).where(NotificationOutbox.userId == actor.actor_id)
            )
            is None
        )


@pytest.mark.anyio
async def test_two_concurrent_admin_removals_leave_one_active_admin(auth_env):
    env = auth_env
    # Отключаем скопированных пользователей только в этой временной БД; в finally восстанавливаем
    # точные значения.
    async with env["sessions"]() as session:
        before = (await session.execute(select(User.id, User.isActive, User.updatedAt))).all()
        await session.execute(update(User).values(isActive=False))
        await session.commit()
    try:
        identifiers = [await env["seed"](), await env["seed"]()]
        actors = [await env["auth"].resolve_actor(identifier, 1) for identifier in identifiers]
        results = await asyncio.gather(
            *(
                env["users"].update(
                    identifier,
                    {"assignments": [AUDITOR_ASSIGNMENT]},
                    RequestContext("admin-race", actor=actor),
                )
                for identifier, actor in zip(identifiers, actors, strict=True)
            ),
            return_exceptions=True,
        )
        assert sum(isinstance(r, dict) for r in results) == 1
        errors = [r for r in results if isinstance(r, DomainError)]
        assert len(errors) == 1 and errors[0].code == "LAST_ADMIN_REQUIRED"
        async with env["factory"]() as uow:
            assert await uow.users.active_admin_count() == 1
    finally:
        async with env["sessions"]() as session:
            for record in before:
                await session.execute(
                    update(User)
                    .where(User.id == record.id)
                    .values(isActive=record.isActive, updatedAt=record.updatedAt)
                )
            await session.commit()


@pytest.mark.anyio
async def test_concurrent_password_changes_accept_one_version_and_one_audit(auth_env):
    env = auth_env
    identifier = await env["seed"]()
    actor = await env["auth"].resolve_actor(identifier, 1)
    results = await asyncio.gather(
        *(
            env["users"].change_password(
                PASSWORD, new, RequestContext("password-race", actor=actor)
            )
            for new in ("new-password-one", "new-password-two")
        ),
        return_exceptions=True,
    )
    assert sum(result is None for result in results) == 1
    assert (
        len(
            [
                result
                for result in results
                if isinstance(result, DomainError) and result.code == "UNAUTHENTICATED"
            ]
        )
        == 1
    )
    async with env["sessions"]() as session:
        assert await session.scalar(select(User.sessionVersion).where(User.id == identifier)) == 2
        assert (
            await session.scalar(
                select(func.count())
                .select_from(AuditLog)
                .where(AuditLog.entityId == identifier, AuditLog.action == "PASSWORD_CHANGE")
            )
            == 1
        )


@pytest.mark.anyio
async def test_own_password_change_is_authenticated_even_without_role_assignments(auth_env):
    env = auth_env
    identifier = await env["seed"](forced=True)
    async with env["sessions"]() as session:
        await session.execute(
            delete(UserRoleAssignment).where(UserRoleAssignment.userId == identifier)
        )
        await session.commit()
    actor = await env["auth"].resolve_actor(identifier, 1)
    assert actor.roles == ()
    await env["users"].change_password(
        PASSWORD, "new-own-password", RequestContext("unassigned-password", actor=actor)
    )
    fresh = await env["auth"].authenticate_credentials(identifier, "new-own-password")
    assert fresh.sessionVersion == 2 and not fresh.mustChangePassword
