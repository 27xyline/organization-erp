"Сценарии подразделений с последовательным изменением структуры организации и записью аудита."

from typing import Any

from app.core.context import Actor, RequestContext
from app.domain.auth.rules import require_permission
from app.domain.departments.rules import (
    normalize_department_code,
    normalize_department_name,
    validate_parent_chain,
)
from app.domain.errors import DomainError, PersistenceConflict
from app.domain.ports.audit import AuditRecord
from app.domain.ports.departments import DepartmentItem
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.services.dto.departments import (
    DepartmentCommand,
    DepartmentListQuery,
    DepartmentReferences,
)

DEPARTMENT_ERRORS = {
    "NOT_FOUND": ("Подразделение не найдено", 404),
    "CODE_EXISTS": ("Подразделение с таким кодом уже существует", 409),
    "NAME_EXISTS": ("Подразделение с таким названием уже существует", 409),
    "PARENT_NOT_FOUND": ("Родительское подразделение не найдено", 422),
    "HEAD_NOT_FOUND": ("Руководитель не найден или больше не работает", 422),
    "CYCLIC_HIERARCHY": ("Нельзя создать циклическую структуру подразделений", 409),
    "IN_USE": ("Подразделение используется и не может быть удалено", 409),
}


def _error(code: str) -> DomainError:
    message, status = DEPARTMENT_ERRORS[code]
    return DomainError(code, message, status)


def _actor(actor: Actor, permission: str, target: dict[str, Any] | None = None) -> None:
    if not actor.is_authenticated or actor.access is None:
        raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)
    if actor.must_change_password:
        raise DomainError("PASSWORD_CHANGE_REQUIRED", "Необходимо изменить временный пароль", 403)
    require_permission(actor.access, permission, target)


async def _check_actor(uow: UnitOfWork, actor: Actor) -> None:
    current = await uow.users.get(actor.actor_id, for_update=True)
    if current is None or not current.is_active or current.session_version != actor.session_version:
        raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)


def _raise_write_error(error: PersistenceConflict) -> None:
    name = error.constraint
    if name == "departments_name_ci_key" or name == "departments_name_key":
        raise _error("NAME_EXISTS") from error
    if name in {"departments_code_ci_key", "departments_code_key"}:
        raise _error("CODE_EXISTS") from error
    if name in {"departments_parentId_fkey", "departments_headEmployeeId_fkey"}:
        raise _error("IN_USE") from error
    if name.endswith("_fkey"):
        raise _error("IN_USE") from error
    raise error


class DepartmentService:
    def __init__(self, uow_factory: UnitOfWorkFactory[UnitOfWork]) -> None:
        self._uow_factory = uow_factory

    async def list(self, query: DepartmentListQuery, actor: Actor) -> list[DepartmentItem]:
        _actor(actor, "departments.read")
        assert actor.access is not None
        async with self._uow_factory() as uow:
            allowed = actor.access.allowed_department_ids("departments.read")
            return await uow.departments.list_visible(
                active_only=query.active_only, allowed_ids=allowed
            )

    async def references(self, actor: Actor) -> DepartmentReferences:
        _actor(actor, "departments.read")
        assert actor.access is not None
        async with self._uow_factory() as uow:
            allowed = actor.access.allowed_department_ids("departments.read")
            return DepartmentReferences(
                tuple(await uow.departments.list_visible(allowed_ids=allowed)),
                tuple(await uow.departments.head_candidates()),
            )

    async def create(self, command: DepartmentCommand, context: RequestContext) -> DepartmentItem:
        actor = context.actor
        assert actor is not None
        _actor(actor, "departments.create")
        code = normalize_department_code(command.code or "")
        name = normalize_department_name(command.name or "")
        async with self._uow_factory() as uow:
            await uow.departments.lock_organization_mutation()
            await _check_actor(uow, actor)
            try:
                await self._validate(
                    uow, code, name, None, command.parent_id, command.head_employee_id
                )
                department = await uow.departments.create(
                    {
                        "code": code,
                        "name": name,
                        "parentId": command.parent_id,
                        "headEmployeeId": command.head_employee_id,
                        "isActive": True if command.is_active is None else command.is_active,
                    }
                )
            except PersistenceConflict as error:
                _raise_write_error(error)
            await uow.audit.append(
                AuditRecord(
                    "DEPARTMENT_CREATE",
                    "Department",
                    department.id,
                    actor.actor_id,
                    {
                        "after": {
                            "code": department.code,
                            "name": department.name,
                            "parentId": department.parent_id,
                            "headEmployeeId": department.head_employee_id,
                            "isActive": department.is_active,
                        }
                    },
                    context.request_id,
                )
            )
            await uow.commit()
            return department

    async def update(
        self, department_id: str, command: DepartmentCommand, context: RequestContext
    ) -> DepartmentItem:
        actor = context.actor
        assert actor is not None
        _actor(actor, "departments.update", {"departmentId": department_id})
        async with self._uow_factory() as uow:
            await uow.departments.lock_organization_mutation()
            await _check_actor(uow, actor)
            current = await uow.departments.get(department_id)
            if current is None:
                raise _error("NOT_FOUND")
            code = (
                normalize_department_code(command.code)
                if command.code is not None
                else current.code
            )
            name = (
                normalize_department_name(command.name)
                if command.name is not None
                else current.name
            )
            parent_id = command.parent_id if command.parent_id_set else current.parent_id
            head_id = (
                command.head_employee_id
                if command.head_employee_id_set
                else current.head_employee_id
            )
            try:
                await self._validate(uow, code, name, department_id, parent_id, head_id)
                department = await uow.departments.update(
                    department_id,
                    {
                        "code": code,
                        "name": name,
                        "parentId": parent_id,
                        "headEmployeeId": head_id,
                        "isActive": current.is_active
                        if command.is_active is None
                        else command.is_active,
                    },
                )
            except PersistenceConflict as error:
                _raise_write_error(error)
            if department is None:
                raise _error("NOT_FOUND")
            if current.name != department.name:
                await uow.departments.update_department_snapshots(department_id, department.name)
            await uow.audit.append(
                AuditRecord(
                    "DEPARTMENT_UPDATE",
                    "Department",
                    department_id,
                    actor.actor_id,
                    {
                        "before": {
                            "code": current.code,
                            "name": current.name,
                            "parentId": current.parent_id,
                            "headEmployeeId": current.head_employee_id,
                            "isActive": current.is_active,
                        },
                        "after": {
                            "code": department.code,
                            "name": department.name,
                            "parentId": department.parent_id,
                            "headEmployeeId": department.head_employee_id,
                            "isActive": department.is_active,
                        },
                    },
                    context.request_id,
                )
            )
            await uow.commit()
            return department

    async def delete(self, department_id: str, context: RequestContext) -> dict[str, bool]:
        actor = context.actor
        assert actor is not None
        _actor(actor, "departments.delete", {"departmentId": department_id})
        async with self._uow_factory() as uow:
            await uow.departments.lock_organization_mutation()
            await _check_actor(uow, actor)
            current = await uow.departments.get(department_id)
            if current is None:
                raise _error("NOT_FOUND")
            if any(current.usage.values()):
                raise _error("IN_USE")
            try:
                await uow.departments.delete(department_id)
            except PersistenceConflict as error:
                _raise_write_error(error)
            await uow.audit.append(
                AuditRecord(
                    "DEPARTMENT_DELETE",
                    "Department",
                    department_id,
                    actor.actor_id,
                    {"before": {"code": current.code, "name": current.name}},
                    context.request_id,
                )
            )
            await uow.commit()
            return {"success": True}

    async def _validate(
        self,
        uow: UnitOfWork,
        code: str,
        name: str,
        exclude_id: str | None,
        parent_id: str | None,
        head_id: str | None,
    ) -> None:
        duplicate = await uow.departments.find_duplicate(code, name, exclude_id=exclude_id)
        if duplicate:
            raise _error("CODE_EXISTS" if duplicate[0].lower() == code.lower() else "NAME_EXISTS")
        validate_parent_chain(exclude_id, parent_id, await uow.departments.parent_links())
        if head_id and not await uow.departments.head_is_active(head_id):
            raise _error("HEAD_NOT_FOUND")
