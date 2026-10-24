"""Personnel changes and idempotent contract archive synchronization."""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime

from app.core.context import Actor, RequestContext
from app.domain.employees.employment import (
    hr_error,
    parse_date,
    validate_contract_dates,
    validate_employment_rate,
)
from app.domain.ports.employees import ActionItem
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.services.dto.employees import EmployeeListQuery, PersonnelActionCommand
from app.services.employees import (
    action_snapshot,
    assignable,
    audit,
    authorize,
    create_in_uow,
    lock_actor,
)

PRIORITY = {
    "HIRE": 0,
    "DISMISS": 1,
    "ARCHIVE": 2,
    "EXTEND": 3,
    "TRANSFER": 4,
    "PROMOTE": 5,
    "EDIT": 6,
}


class PersonnelActionService:
    def __init__(self, factory: UnitOfWorkFactory[UnitOfWork]) -> None:
        self._factory = factory

    async def list(self, query: EmployeeListQuery, actor: Actor) -> tuple[list[ActionItem], int]:
        authorize(actor, "personnelActions.read")
        assert actor.access is not None
        async with self._factory() as uow:
            actions = await uow.workforce.actions(actor.access)
            offset = (query.page - 1) * query.page_size
            rows = actions[offset : offset + query.page_size]
            rows.sort(
                key=lambda row: (
                    -row.createdAt.timestamp(),
                    PRIORITY[row.type],
                    row.employee.fullName,
                )
            )
            return rows, len(actions)

    async def create(self, command: PersonnelActionCommand, context: RequestContext) -> ActionItem:
        actor = context.actor
        assert actor is not None
        authorize(actor, "personnelActions.create")
        action_date = parse_date(command.date, code="INVALID_ACTION_DATE")
        assert action_date is not None
        async with self._factory() as uow:
            await lock_actor(uow, actor)
            await uow.payroll_input_lock.lock_exclusive()
            if command.type == "HIRE":
                if command.employeeData is None:
                    raise hr_error("INVALID_HIRE_PAYLOAD")
                employee = await create_in_uow(
                    uow,
                    replace(
                        command.employeeData,
                        phone=command.employeeData.phone or None,
                        email=command.employeeData.email or None,
                        photo=command.employeeData.photo or None,
                    ),
                    actor,
                    "personnelActions.create",
                )
                action = await uow.workforce.create_action(
                    dict(
                        type="HIRE",
                        date=employee.contractSignedDate,
                        description=command.description or None,
                        employeeId=employee.id,
                        oldDepartment=None,
                        newDepartment=employee.department or None,
                        oldPosition=None,
                        newPosition=employee.staffSchedule.position
                        if employee.staffSchedule
                        else None,
                        oldContractEndDate=None,
                        newContractEndDate=employee.contractEndDate,
                    )
                )
                await audit(
                    uow,
                    context,
                    "PERSONNEL_ACTION_CREATE",
                    "PersonnelAction",
                    action.id,
                    {"employeeId": employee.id, "type": action.type},
                )
            else:
                if not command.employeeId:
                    raise hr_error("MISSING_EMPLOYEE_ID")
                existing = await uow.employees.get(command.employeeId)
                if not existing:
                    raise hr_error("EMPLOYEE_NOT_FOUND")
                employee = existing
                authorize(actor, "personnelActions.create", employee.target())
                rate = (
                    command.employmentRate
                    if command.employmentRate is not None
                    else employee.employmentRate
                )
                position = None
                if command.type in ("TRANSFER", "PROMOTE"):
                    validate_employment_rate(rate)
                    position = await assignable(
                        uow, command.staffScheduleId, rate, "ACTIVE", employee_id=employee.id
                    )
                elif command.staffScheduleId:
                    position = await uow.workforce.position(command.staffScheduleId)
                department = employee.department or None
                position_name = (
                    command.newPosition
                    or (position.position if position else None)
                    or (employee.staffSchedule.position if employee.staffSchedule else None)
                )
                status, position_id, department_id = (
                    employee.status,
                    employee.staffScheduleId,
                    employee.departmentId,
                )
                end, next_rate = employee.contractEndDate, employee.employmentRate
                if command.newContractEndDate:
                    end = parse_date(command.newContractEndDate)
                    validate_contract_dates(employee.contractSignedDate, end)
                if command.type in ("TRANSFER", "PROMOTE"):
                    assert position is not None
                    authorize(
                        actor,
                        "personnelActions.create",
                        {
                            "employeeId": employee.id,
                            "departmentIds": [employee.departmentId, position.departmentId],
                        },
                    )
                    status, position_id, department_id = (
                        "ACTIVE",
                        position.id,
                        position.departmentId,
                    )
                    department, next_rate = position.department, rate
                elif command.type == "DISMISS":
                    status, department, position_name = "DISMISSED", None, None
                elif command.type == "EXTEND":
                    if not command.newContractEndDate:
                        raise hr_error("MISSING_CONTRACT_END_DATE")
                    status = "ACTIVE"
                    position_name = (
                        employee.staffSchedule.position if employee.staffSchedule else None
                    )
                action = await uow.workforce.create_action(
                    action_snapshot(
                        employee,
                        action_type=command.type,
                        date=action_date,
                        description=command.description or None,
                        department=department,
                        position=position_name,
                        contract_end=end,
                    )
                )
                await uow.employees.update(
                    employee.id,
                    {
                        "department": department or employee.department,
                        "departmentId": department_id,
                        "status": status,
                        "staffScheduleId": position_id,
                        "contractEndDate": end,
                        "employmentRate": next_rate,
                    },
                )
                cleared = (
                    await uow.employees.clear_leadership(employee.id)
                    if command.type == "DISMISS"
                    else []
                )
                await audit(
                    uow,
                    context,
                    "PERSONNEL_ACTION_CREATE",
                    "PersonnelAction",
                    action.id,
                    {
                        "employeeId": employee.id,
                        "type": action.type,
                        "clearedDepartmentHeads": cleared,
                    },
                )
            await uow.commit()
            # Legacy relation was captured before the employee update; preserve that shape.
            return action

    async def delete(self, identifier: str, context: RequestContext) -> dict[str, bool]:
        actor = context.actor
        assert actor is not None
        authorize(actor, "personnelActions.delete")
        async with self._factory() as uow:
            await lock_actor(uow, actor)
            await uow.payroll_input_lock.lock_exclusive()
            action = await uow.workforce.action(identifier)
            if not action:
                raise hr_error("INVALID_ACTION_DATE")
            authorize(actor, "personnelActions.delete", action.employee.target())
            await uow.workforce.delete_action(identifier)
            await audit(
                uow,
                context,
                "PERSONNEL_ACTION_DELETE",
                "PersonnelAction",
                identifier,
                {"employeeId": action.employeeId, "type": action.type},
            )
            await uow.commit()
            return {"success": True}

    async def sync(self, context: RequestContext) -> int:
        actor = context.actor
        assert actor is not None and actor.access is not None
        authorize(actor, "personnelActions.sync")
        async with self._factory() as uow:
            await lock_actor(uow, actor)
            await uow.payroll_input_lock.lock_exclusive()
            today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            employees = await uow.employees.list(
                "expired", today, actor.access, "personnelActions.sync"
            )
            keys = await uow.workforce.archive_keys(tuple(row.id for row in employees))
            count = 0
            for employee in employees:
                key = employee.id, employee.contractEndDate
                if key not in keys:
                    await uow.workforce.create_action(
                        action_snapshot(
                            employee,
                            action_type="ARCHIVE",
                            date=employee.contractEndDate or today,
                            description="Закончился срок действия трудового договора",
                            department=employee.department or None,
                            position=employee.staffSchedule.position
                            if employee.staffSchedule
                            else None,
                            contract_end=employee.contractEndDate,
                        )
                    )
                    keys.add(key)
                    count += 1
            await uow.commit()
            return count
