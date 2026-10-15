"""Employee use cases; organization mutations and audit share one explicit commit."""

from __future__ import annotations

import builtins
from dataclasses import asdict
from datetime import datetime
from decimal import Decimal
from typing import Any

from app.core.context import Actor, RequestContext
from app.domain.auth.rules import require_permission
from app.domain.catalogs.rules import normalize_department_reference
from app.domain.employees.employment import (
    fixed_money,
    hr_error,
    parse_date,
    validate_contract_dates,
    validate_employment_rate,
)
from app.domain.employees.rules import validate_certificate_dates, validate_skill_names
from app.domain.errors import DomainError, PersistenceConflict
from app.domain.ports.audit import AuditRecord
from app.domain.ports.employees import (
    EmployeeItem,
    ProfileComposition,
    ProjectEmployeeReference,
    StaffItem,
)
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.services.dto.employees import (
    EmployeeCommand,
    EmployeeListQuery,
    EmployeeReferenceQuery,
    ProfileCommand,
)


def authorize(actor: Actor, permission: str, target: dict[str, Any] | None = None) -> None:
    if not actor.is_authenticated or actor.access is None:
        raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)
    if actor.must_change_password:
        raise DomainError("PASSWORD_CHANGE_REQUIRED", "Необходимо изменить временный пароль", 403)
    require_permission(actor.access, permission, target)


async def lock_actor(uow: UnitOfWork, actor: Actor) -> None:
    await uow.departments.lock_organization_mutation()
    current = await uow.users.get(actor.actor_id, for_update=True)
    if current is None or not current.is_active or current.session_version != actor.session_version:
        raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)
    if current.must_change_password:
        raise DomainError("PASSWORD_CHANGE_REQUIRED", "Необходимо изменить временный пароль", 403)


async def audit(
    uow: UnitOfWork,
    context: RequestContext,
    action: str,
    entity: str,
    identifier: str,
    details: dict[str, Any],
) -> None:
    assert context.actor is not None
    await uow.audit.append(
        AuditRecord(action, entity, identifier, context.actor.actor_id, details, context.request_id)
    )


def employee_conflict(error: PersistenceConflict) -> None:
    if error.constraint == "employees_code_key":
        raise DomainError(
            "EMPLOYEE_CODE_EXISTS", "Сотрудник с таким табельным номером уже существует", 409
        ) from error
    raise error


async def resolve_department(
    uow: UnitOfWork, identifier: str | None, name: str | None, allow_inactive: str | None = None
) -> tuple[str, str]:
    identifier, name = normalize_department_reference(identifier, name)
    department = await uow.mols.resolve_department(identifier, name)
    if department is None:
        raise DomainError("NOT_FOUND", "Подразделение не найдено", 404)
    if not department.is_active and department.id != allow_inactive:
        raise DomainError("INACTIVE_DEPARTMENT", "Нельзя назначить неактивное подразделение", 409)
    return department.id, department.name


async def assignable(
    uow: UnitOfWork,
    identifier: str | None,
    rate: Decimal,
    status: str,
    *,
    employee_id: str | None = None,
    allow_inactive: bool = False,
) -> StaffItem | None:
    if not identifier:
        if status != "DISMISSED":
            raise hr_error("POSITION_REQUIRED")
        return None
    position = await uow.workforce.position(identifier)
    if not position:
        raise hr_error("POSITION_NOT_FOUND")
    if not position.department_active and not allow_inactive:
        raise hr_error("INACTIVE_POSITION_DEPARTMENT")
    occupied = await uow.workforce.occupied_rate(identifier, employee_id)
    if status != "DISMISSED" and rate > max(position.rate - occupied, Decimal(0)):
        raise hr_error("INSUFFICIENT_POSITION_RATE")
    return position


def action_snapshot(
    employee: EmployeeItem,
    *,
    action_type: str,
    date: datetime,
    description: str | None,
    department: str | None,
    position: str | None,
    contract_end: datetime | None,
) -> dict[str, Any]:
    return dict(
        type=action_type,
        date=date,
        description=description,
        employeeId=employee.id,
        oldDepartment=employee.department or None,
        newDepartment=department,
        oldPosition=employee.staffSchedule.position if employee.staffSchedule else None,
        newPosition=position,
        oldContractEndDate=employee.contractEndDate,
        newContractEndDate=contract_end,
    )


async def create_in_uow(
    uow: UnitOfWork, command: EmployeeCommand, actor: Actor, permission: str
) -> EmployeeItem:
    if (
        not command.code
        or not command.fullName
        or not command.contractNumber
        or not command.contractSignedDate
    ):
        raise hr_error("INVALID_HIRE_PAYLOAD")
    rate = command.employmentRate if command.employmentRate is not None else Decimal(0)
    validate_employment_rate(rate)
    signed = parse_date(command.contractSignedDate)
    end = parse_date(command.contractEndDate, optional=True)
    validate_contract_dates(signed, end)
    position = await assignable(uow, command.staffScheduleId, rate, "ACTIVE")
    assert position is not None
    authorize(actor, permission, {"departmentId": position.departmentId})
    values = dict(
        code=command.code,
        fullName=command.fullName,
        department=position.department,
        departmentId=position.departmentId,
        photo=command.photo,
        phone=command.phone,
        email=command.email,
        contractType=command.contractType or "PRIMARY",
        contractSignedDate=signed,
        contractEndDate=end,
        contractNumber=command.contractNumber,
        staffScheduleId=command.staffScheduleId,
        employmentRate=rate,
        status="ACTIVE",
    )
    try:
        return await uow.employees.create(values)
    except PersistenceConflict as error:
        employee_conflict(error)
        raise


class EmployeeService:
    def __init__(self, uow_factory: UnitOfWorkFactory[UnitOfWork]) -> None:
        self._factory = uow_factory

    async def list(
        self, query: EmployeeListQuery, actor: Actor
    ) -> tuple[builtins.list[EmployeeItem], int]:
        authorize(actor, "employees.read")
        assert actor.access is not None
        async with self._factory() as uow:
            return await uow.employees.list_page(
                query.scope,
                datetime.now().replace(hour=0, minute=0, second=0, microsecond=0),
                actor.access,
                query.page,
                query.page_size,
            )

    async def references(self, actor: Actor) -> builtins.list[EmployeeItem]:
        authorize(actor, "employees.read")
        assert actor.access is not None
        async with self._factory() as uow:
            return await uow.employees.list("active", datetime.now(), actor.access)

    async def project_references(
        self, query: EmployeeReferenceQuery, actor: Actor
    ) -> builtins.list[ProjectEmployeeReference]:
        authorize(actor, "projectMembers.create", {"projectId": query.project_id})
        assert actor.access is not None
        async with self._factory() as uow:
            if not await uow.employees.project_exists(query.project_id):
                raise DomainError("PROJECT_NOT_FOUND", "Проект не найден", 404)
            include_salary = actor.access.allows(
                "projectPayroll.read", {"projectId": query.project_id}
            )
            result = []
            for employee in await uow.employees.available_for_project(query.project_id):
                position = employee.staffSchedule
                result.append(
                    ProjectEmployeeReference(
                        employee.id,
                        employee.code,
                        employee.fullName,
                        position.department if position else employee.department or "—",
                        position.position if position else "—",
                        fixed_money(float(employee.employmentRate)),
                        fixed_money(
                            float(position.salary if position else 0)
                            * float(employee.employmentRate)
                        )
                        if include_salary
                        else "",
                    )
                )
            return result

    async def create(self, command: EmployeeCommand, context: RequestContext) -> EmployeeItem:
        actor = context.actor
        assert actor is not None
        authorize(actor, "employees.create")
        async with self._factory() as uow:
            await lock_actor(uow, actor)
            employee = await create_in_uow(uow, command, actor, "employees.create")
            await uow.workforce.create_action(
                dict(
                    type="HIRE",
                    date=employee.contractSignedDate,
                    description=command.hireDescription or "Прием на работу",
                    employeeId=employee.id,
                    oldDepartment=None,
                    newDepartment=employee.department,
                    oldPosition=None,
                    newPosition=employee.staffSchedule.position if employee.staffSchedule else None,
                    oldContractEndDate=None,
                    newContractEndDate=employee.contractEndDate,
                )
            )
            await audit(
                uow,
                context,
                "EMPLOYEE_CREATE",
                "Employee",
                employee.id,
                {
                    "after": {
                        "id": employee.id,
                        "code": employee.code,
                        "fullName": employee.fullName,
                    }
                },
            )
            await uow.commit()
            return employee

    async def update(
        self, identifier: str, command: EmployeeCommand, context: RequestContext
    ) -> EmployeeItem:
        actor = context.actor
        assert actor is not None
        authorize(actor, "employees.update")
        async with self._factory() as uow:
            await lock_actor(uow, actor)
            before = await uow.employees.get(identifier)
            if not before:
                raise hr_error("EMPLOYEE_NOT_FOUND")
            authorize(actor, "employees.update", before.target())
            data = command.changes()
            rate = (
                command.employmentRate
                if "employmentRate" in command.fields and command.employmentRate is not None
                else before.employmentRate
            )
            status = command.status or before.status
            if status != "DISMISSED":
                validate_employment_rate(rate)
            signed = (
                parse_date(command.contractSignedDate)
                if "contractSignedDate" in data
                else before.contractSignedDate
            )
            # Legacy update preserves the current end date for blank/null input.
            end = (
                parse_date(command.contractEndDate, optional=True)
                if "contractEndDate" in data and command.contractEndDate not in ("", None)
                else before.contractEndDate
            )
            validate_contract_dates(signed, end)
            position_id = (
                command.staffScheduleId if "staffScheduleId" in data else before.staffScheduleId
            )
            position = await assignable(
                uow,
                position_id,
                rate,
                status,
                employee_id=identifier,
                allow_inactive=before.status != "DISMISSED"
                and position_id == before.staffScheduleId,
            )
            department_id, department_name = (
                (position.departmentId, position.department)
                if position
                else (
                    await resolve_department(uow, None, command.department, before.departmentId)
                    if command.department
                    else (before.departmentId, before.department)
                )
            )
            authorize(
                actor,
                "employees.update",
                {"employeeId": identifier, "departmentIds": [before.departmentId, department_id]},
            )
            data.pop("department", None)
            data.update(departmentId=department_id, department=department_name)
            if "contractSignedDate" in data:
                data["contractSignedDate"] = signed
            if "contractEndDate" in data:
                if command.contractEndDate in ("", None):
                    data.pop("contractEndDate")
                else:
                    data["contractEndDate"] = end
            data["employmentRate"] = before.employmentRate if status == "DISMISSED" else rate
            try:
                employee = await uow.employees.update(identifier, data)
            except PersistenceConflict as error:
                employee_conflict(error)
                raise
            cleared = (
                await uow.employees.clear_leadership(identifier)
                if before.status != "DISMISSED" and employee.status == "DISMISSED"
                else []
            )
            names = {
                "fullName": "ФИО",
                "code": "табельный номер",
                "staffScheduleId": "должность",
                "employmentRate": "количество ставок",
                "department": "подразделение",
                "contractType": "вид договора",
                "contractSignedDate": "дату подписания договора",
                "contractEndDate": "срок действия договора",
                "contractNumber": "номер договора",
                "status": "статус",
            }
            changed = [
                label
                for key, label in names.items()
                if key in data and getattr(before, key) != getattr(employee, key)
            ]
            if changed:
                await uow.workforce.create_action(
                    action_snapshot(
                        before,
                        action_type="EDIT",
                        date=datetime.now(),
                        description="Изменены данные сотрудника: " + ", ".join(changed),
                        department=employee.department,
                        position=employee.staffSchedule.position
                        if employee.staffSchedule
                        else None,
                        contract_end=employee.contractEndDate,
                    )
                )
                await audit(
                    uow,
                    context,
                    "EMPLOYEE_UPDATE",
                    "Employee",
                    identifier,
                    {"changedFields": changed, "clearedDepartmentHeads": cleared},
                )
            await uow.commit()
            return employee

    async def dismiss(self, identifier: str, context: RequestContext) -> EmployeeItem:
        actor = context.actor
        assert actor is not None
        authorize(actor, "employees.delete")
        async with self._factory() as uow:
            await lock_actor(uow, actor)
            employee = await uow.employees.get(identifier)
            if not employee:
                raise hr_error("EMPLOYEE_NOT_FOUND")
            authorize(actor, "employees.delete", employee.target())
            updated = await uow.employees.update(identifier, {"status": "DISMISSED"})
            cleared = await uow.employees.clear_leadership(identifier)
            await uow.workforce.create_action(
                action_snapshot(
                    employee,
                    action_type="DISMISS",
                    date=datetime.now(),
                    description="Уволен",
                    department=None,
                    position=None,
                    contract_end=employee.contractEndDate,
                )
            )
            await audit(
                uow,
                context,
                "EMPLOYEE_DISMISS",
                "Employee",
                identifier,
                {
                    "before": {"status": employee.status},
                    "after": {"status": "DISMISSED"},
                    "clearedDepartmentHeads": cleared,
                },
            )
            await uow.commit()
            return updated

    async def profile(self, identifier: str, actor: Actor) -> ProfileComposition | None:
        authorize(actor, "employees.read")
        assert actor.access is not None
        async with self._factory() as uow:
            employee = await uow.employees.get(identifier)
            if not employee or not actor.access.allows("employees.read", employee.target()):
                return None
            return await uow.employees.profile(employee, actor.access)

    async def update_profile(
        self, identifier: str, command: ProfileCommand, context: RequestContext
    ) -> EmployeeItem:
        actor = context.actor
        assert actor is not None and actor.access is not None
        authorize(actor, "employees.update")
        validate_skill_names(tuple(skill.name for skill in command.skills))
        certificates = []
        for certificate in command.certificates:
            values = asdict(certificate)
            values["issuer"] = certificate.issuer or None
            values["number"] = certificate.number or None
            values["issuedAt"] = parse_date(certificate.issuedAt, optional=True)
            values["expiresAt"] = parse_date(certificate.expiresAt, optional=True)
            validate_certificate_dates(values["issuedAt"], values["expiresAt"])
            certificates.append(values)
        async with self._factory() as uow:
            await lock_actor(uow, actor)
            before = await uow.employees.get(identifier)
            if not before:
                raise hr_error("EMPLOYEE_NOT_FOUND")
            authorize(actor, "employees.update", before.target())
            if command.managerId:
                manager = await uow.employees.get(command.managerId)
                if (
                    not manager
                    or manager.id == identifier
                    or manager.status == "DISMISSED"
                    or manager.managerId == identifier
                    or not actor.access.allows("employees.read", manager.target())
                ):
                    raise DomainError("INVALID_MANAGER", "Нельзя назначить этого руководителя", 422)
            employee = await uow.employees.update(
                identifier,
                {
                    "birthDate": parse_date(command.birthDate, optional=True),
                    "education": command.education or None,
                    "qualification": command.qualification or None,
                    "managerId": command.managerId or None,
                },
            )
            await uow.employees.replace_profile(
                identifier, tuple(asdict(skill) for skill in command.skills), tuple(certificates)
            )
            await audit(
                uow,
                context,
                "EMPLOYEE_PROFILE_UPDATE",
                "Employee",
                identifier,
                {
                    "managerChanged": before.managerId != (command.managerId or None),
                    "skills": len(command.skills),
                    "certificates": len(command.certificates),
                },
            )
            await uow.commit()
            return employee
