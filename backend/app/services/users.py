"""User use cases own permissions and a single transaction, including audit."""

from datetime import datetime
from typing import Any

from app.core.context import Actor, RequestContext
from app.domain.auth.rules import require_permission
from app.domain.errors import DomainError
from app.domain.ports.audit import AuditRecord, JsonValue
from app.domain.ports.passwords import PasswordHasher
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.services.auth import utc_now

ERRORS: dict[str, tuple[str, int]] = {
    "USER_NOT_FOUND": ("Пользователь не найден", 404),
    "CANNOT_DEACTIVATE_SELF": ("Нельзя отключить собственную учётную запись", 409),
    "LAST_ADMIN_REQUIRED": ("В системе должен остаться хотя бы один активный администратор", 409),
    "INVALID_SCOPE_ASSIGNMENT": ("Недопустимая область доступа для выбранной роли", 422),
    "INVALID_SCOPE_REFERENCE": ("Подразделение, проект или сотрудник не найден", 422),
    "EMPLOYEE_LINK_REQUIRED": ("Для роли сотрудника нужна кадровая карточка", 422),
    "INVALID_CURRENT_PASSWORD": ("Текущий пароль указан неверно", 422),
}


def fail(code: str) -> None:
    message, status = ERRORS[code]
    raise DomainError(code, message, status)


def json_value(value: Any) -> JsonValue:
    if isinstance(value, datetime):
        return value.isoformat(timespec="milliseconds") + "Z"
    if isinstance(value, dict):
        return {key: json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_value(item) for item in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    raise TypeError("Unsupported audit value")


def normalize_assignments(assignments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    for assignment in assignments:
        a = {
            **assignment,
            "departmentIds": list(dict.fromkeys(assignment["departmentIds"])),
            "projectIds": list(dict.fromkeys(assignment["projectIds"])),
        }
        role, department, project = a["role"], a["departmentScopeMode"], a["projectScopeMode"]
        scoped = ("ALL", "ASSIGNED")
        valid = (
            (role in ("ADMIN", "AUDITOR") and department == project == "ALL")
            or (role == "EMPLOYEE" and department == project == "SELF")
            or (role in ("HR", "ASSET_CUSTODIAN") and department in scoped and project == "NONE")
            or (
                role in ("ACCOUNTANT", "DEPARTMENT_HEAD")
                and department in scoped
                and project in scoped
            )
            or (role == "PROJECT_MANAGER" and department == "NONE" and project in scoped)
        )
        if not valid:
            fail("INVALID_SCOPE_ASSIGNMENT")
        if department != "ASSIGNED":
            a["departmentIds"] = []
        if project != "ASSIGNED":
            a["projectIds"] = []
        result.append(a)
    return result


def compatibility_role(assignments: list[dict[str, Any]]) -> str:
    roles = {a["role"] for a in assignments}
    return (
        "ADMIN" if "ADMIN" in roles else "EDITOR" if roles - {"AUDITOR", "EMPLOYEE"} else "VIEWER"
    )


def authorize(actor: Actor, permission: str, *, password_change: bool = False) -> None:
    if not actor.is_authenticated or actor.access is None:
        raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)
    if actor.must_change_password and not password_change:
        raise DomainError("PASSWORD_CHANGE_REQUIRED", "Необходимо изменить временный пароль", 403)
    if not password_change:
        require_permission(actor.access, permission)


class UserService:
    def __init__(
        self, uow_factory: UnitOfWorkFactory[UnitOfWork], passwords: PasswordHasher
    ) -> None:
        self._uow_factory = uow_factory
        self._passwords = passwords

    async def list_users(
        self, page: int, page_size: int, actor: Actor
    ) -> tuple[list[dict[str, Any]], int]:
        authorize(actor, "access.users.read")
        async with self._uow_factory() as uow:
            return await uow.users.list_users(page, page_size)

    async def references(self, actor: Actor) -> dict[str, Any]:
        authorize(actor, "access.users.read")
        async with self._uow_factory() as uow:
            return await uow.users.references()

    async def _check_actor(self, uow: UnitOfWork, actor: Actor) -> None:
        current = await uow.users.get(actor.actor_id, for_update=True)
        if (
            current is None
            or not current.is_active
            or current.session_version != actor.session_version
        ):
            raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)

    async def _validate(
        self, uow: UnitOfWork, assignments: list[dict[str, Any]], employee_id: str | None
    ) -> None:
        if not await uow.users.validate_references(assignments, employee_id):
            fail("INVALID_SCOPE_REFERENCE")
        if any(a["role"] == "EMPLOYEE" for a in assignments) and not employee_id:
            fail("EMPLOYEE_LINK_REQUIRED")

    async def create(self, input: dict[str, Any], context: RequestContext) -> dict[str, Any]:
        actor = context.actor
        assert actor is not None
        authorize(actor, "access.users.create")
        assignments = normalize_assignments(input["assignments"])
        password_hash = await self._passwords.hash(input["temporaryPassword"])
        async with self._uow_factory() as uow:
            await self._check_actor(uow, actor)
            await self._validate(uow, assignments, input.get("employeeId"))
            user = await uow.users.create(
                {
                    "username": input["username"],
                    "name": input["name"],
                    "employeeId": input.get("employeeId"),
                    "role": compatibility_role(assignments),
                    "passwordHash": password_hash,
                    "mustChangePassword": True,
                },
                assignments,
            )
            await uow.audit.append(
                AuditRecord(
                    "USER_CREATE",
                    "User",
                    user.id,
                    actor.actor_id,
                    {"before": None, "after": json_value(user.public)},
                    context.request_id,
                )
            )
            await uow.commit()
            return user.public

    async def update(
        self, user_id: str, input: dict[str, Any], context: RequestContext
    ) -> dict[str, Any]:
        actor = context.actor
        assert actor is not None
        authorize(actor, "access.users.update")
        if user_id == actor.actor_id and input.get("isActive") is False:
            fail("CANNOT_DEACTIVATE_SELF")
        password_hash = (
            await self._passwords.hash(input["temporaryPassword"])
            if input.get("temporaryPassword")
            else None
        )
        async with self._uow_factory() as uow:
            await uow.users.lock_admin_changes()
            await self._check_actor(uow, actor)
            current = await uow.users.get(user_id, for_update=True)
            if current is None:
                fail("USER_NOT_FOUND")
                raise AssertionError("unreachable")
            assignments = (
                normalize_assignments(input["assignments"])
                if "assignments" in input
                else [
                    {
                        "role": g.role,
                        "departmentScopeMode": g.department_scope_mode,
                        "projectScopeMode": g.project_scope_mode,
                        "departmentIds": list(g.department_ids),
                        "projectIds": list(g.project_ids),
                    }
                    for g in current.grants
                ]
            )
            employee_id = input.get("employeeId") if "employeeId" in input else current.employee_id
            await self._validate(uow, assignments, employee_id)
            removes_admin = (
                current.is_active
                and any(g.role == "ADMIN" for g in current.grants)
                and (
                    not any(a["role"] == "ADMIN" for a in assignments)
                    or input.get("isActive") is False
                )
            )
            if removes_admin and await uow.users.active_admin_count() <= 1:
                fail("LAST_ADMIN_REQUIRED")
            values: dict[str, Any] = {
                key: input[key] for key in ("name", "isActive") if key in input
            }
            values.update(employeeId=employee_id, role=compatibility_role(assignments))
            # Permission/scope changes and disabling revoke sessions, in addition to passwords.
            if (
                password_hash
                or "assignments" in input
                or employee_id != current.employee_id
                or input.get("isActive") is False
            ):
                values["sessionVersion"] = current.session_version + 1
            if password_hash:
                values.update(
                    passwordHash=password_hash,
                    mustChangePassword=True,
                    passwordChangedAt=utc_now(),
                    failedLoginAttempts=0,
                    lockedUntil=None,
                )
            user = await uow.users.update(
                user_id, values, assignments if "assignments" in input else None
            )
            await uow.audit.append(
                AuditRecord(
                    "USER_UPDATE",
                    "User",
                    user_id,
                    actor.actor_id,
                    {"before": json_value(current.public), "after": json_value(user.public)},
                    context.request_id,
                )
            )
            await uow.commit()
            return user.public

    async def change_password(
        self, current_password: str, new_password: str, context: RequestContext
    ) -> None:
        actor = context.actor
        assert actor is not None
        authorize(actor, "account.password.update", password_change=True)
        async with self._uow_factory() as uow:
            current = await uow.users.get(actor.actor_id, for_update=True)
            if (
                current is None
                or not current.is_active
                or current.session_version != actor.session_version
            ):
                raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)
            if not await self._passwords.verify(current.password_hash, current_password):
                fail("INVALID_CURRENT_PASSWORD")
            password_hash = await self._passwords.hash(new_password)
            await uow.users.update_auth(
                current.id,
                {
                    "passwordHash": password_hash,
                    "mustChangePassword": False,
                    "sessionVersion": current.session_version + 1,
                    "passwordChangedAt": utc_now(),
                    "failedLoginAttempts": 0,
                    "lockedUntil": None,
                },
            )
            await uow.audit.append(
                AuditRecord(
                    "PASSWORD_CHANGE",
                    "User",
                    current.id,
                    current.id,
                    {"changed": True},
                    context.request_id,
                )
            )
            await uow.commit()
