"""Staff schedule and absence workflows. Legacy permits overlapping vacations."""

from datetime import datetime
from decimal import Decimal
from typing import Any

from app.core.context import Actor, RequestContext
from app.domain.employees.employment import hr_error, parse_date
from app.domain.errors import DomainError
from app.domain.ports.employees import PositionSummary, StaffItem, VacationItem
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.services.dto.employees import EmployeeDashboard, StaffCommand, VacationCommand
from app.services.employees import audit, authorize, lock_actor, resolve_department


class WorkforceService:
    def __init__(self, factory: UnitOfWorkFactory[UnitOfWork]) -> None:
        self._factory = factory

    async def positions(self, actor: Actor) -> list[PositionSummary]:
        authorize(actor, "staffSchedule.read")
        assert actor.access is not None
        async with self._factory() as uow:
            return await self._positions(uow, actor)

    async def _positions(self, uow: UnitOfWork, actor: Actor) -> list[PositionSummary]:
        assert actor.access is not None
        result = []
        for position, employees in await uow.workforce.positions(actor.access):
            occupied = sum((employee.employmentRate for employee in employees), Decimal(0))
            result.append(
                PositionSummary(
                    position, tuple(employees), occupied, max(position.rate - occupied, Decimal(0))
                )
            )
        return result

    async def save_position(
        self, identifier: str | None, command: StaffCommand, context: RequestContext
    ) -> StaffItem:
        actor = context.actor
        assert actor is not None
        permission = "staffSchedule.update" if identifier else "staffSchedule.create"
        authorize(actor, permission)
        async with self._factory() as uow:
            await lock_actor(uow, actor)
            before = await uow.workforce.position(identifier) if identifier else None
            if identifier and before is None:
                raise DomainError("NOT_FOUND", "Должность не найдена", 404)
            department_id, department = await resolve_department(
                uow,
                command.departmentId,
                command.department,
                before.departmentId if before else None,
            )
            authorize(
                actor,
                permission,
                {"departmentIds": [department_id] + ([before.departmentId] if before else [])},
            )
            if before:
                occupied = await uow.workforce.occupied_rate(before.id)
                if command.rate < occupied:
                    raise DomainError(
                        "RATE_BELOW_OCCUPIED",
                        "Нельзя уменьшить количество ставок ниже занятого значения",
                        409,
                    )
                if department_id != before.departmentId and occupied > 0:
                    raise DomainError(
                        "POSITION_DEPARTMENT_CHANGE_IN_USE",
                        "Нельзя изменить подразделение должности с назначенными сотрудниками",
                        409,
                    )
            position = await uow.workforce.save_position(
                identifier,
                {
                    "position": command.position.strip(),
                    "department": department,
                    "departmentId": department_id,
                    "rate": command.rate,
                    "salary": command.salary,
                },
            )
            keys = ("position", "departmentId", "department")
            after = {key: getattr(position, key) for key in keys}
            details: dict[str, Any] = {"after": after}
            if before:
                details["before"] = {key: getattr(before, key) for key in keys} | {
                    "rate": format(before.rate.normalize(), "f"),
                    "salary": format(before.salary.normalize(), "f"),
                }
                after.update(
                    rate=format(position.rate.normalize(), "f"),
                    salary=format(position.salary.normalize(), "f"),
                )
            await audit(
                uow,
                context,
                "STAFF_POSITION_UPDATE" if identifier else "STAFF_POSITION_CREATE",
                "StaffSchedule",
                position.id,
                details,
            )
            await uow.commit()
            return position

    async def delete_position(self, identifier: str, context: RequestContext) -> dict[str, bool]:
        actor = context.actor
        assert actor is not None
        authorize(actor, "staffSchedule.delete")
        async with self._factory() as uow:
            await lock_actor(uow, actor)
            position = await uow.workforce.position(identifier)
            if not position:
                raise DomainError("NOT_FOUND", "Должность не найдена", 404)
            authorize(actor, "staffSchedule.delete", {"departmentId": position.departmentId})
            if await uow.workforce.has_active_employees(identifier):
                raise DomainError(
                    "POSITION_IN_USE", "Нельзя удалить должность с назначенными сотрудниками", 409
                )
            await uow.workforce.delete_position(identifier)
            await audit(
                uow,
                context,
                "STAFF_POSITION_DELETE",
                "StaffSchedule",
                identifier,
                {
                    "before": {
                        key: getattr(position, key)
                        for key in ("position", "departmentId", "department")
                    }
                },
            )
            await uow.commit()
            return {"success": True}

    async def vacations(self, year: int, actor: Actor) -> list[VacationItem]:
        authorize(actor, "vacations.read")
        assert actor.access is not None
        async with self._factory() as uow:
            return await uow.workforce.vacations(year, actor.access)

    async def save_vacation(
        self, identifier: str | None, command: VacationCommand, context: RequestContext
    ) -> VacationItem:
        actor = context.actor
        assert actor is not None
        permission = "vacations.update" if identifier else "vacations.create"
        authorize(actor, permission)
        try:
            start = parse_date(command.startDate, code="INVALID_ACTION_DATE")
            end = parse_date(command.endDate, code="INVALID_ACTION_DATE")
        except DomainError as error:
            raise DomainError("INVALID_DATES", "Некорректные даты отпуска", 422) from error
        if start is None or end is None or start > end:
            raise DomainError("INVALID_DATES", "Некорректные даты отпуска", 422)
        async with self._factory() as uow:
            await lock_actor(uow, actor)
            before = await uow.workforce.vacation(identifier) if identifier else None
            if identifier and not before:
                raise DomainError("NOT_FOUND", "Отпуск не найден", 404)
            employee = await uow.employees.get(command.employeeId)
            if not employee:
                raise hr_error("EMPLOYEE_NOT_FOUND")
            authorize(
                actor,
                permission,
                {
                    "employeeId": employee.id,
                    "departmentIds": [employee.departmentId]
                    + ([before.employee.departmentId] if before else []),
                },
            )
            vacation = await uow.workforce.save_vacation(
                identifier,
                {
                    "employeeId": command.employeeId,
                    "startDate": start,
                    "endDate": end,
                    "type": command.type,
                },
            )

            def snapshot(item: VacationItem) -> dict[str, Any]:
                return {
                    "employeeId": item.employeeId,
                    "startDate": item.startDate.isoformat(timespec="milliseconds") + "Z",
                    "endDate": item.endDate.isoformat(timespec="milliseconds") + "Z",
                }

            await audit(
                uow,
                context,
                "VACATION_UPDATE" if identifier else "VACATION_CREATE",
                "Vacation",
                vacation.id,
                {"before": snapshot(before) if before else None, "after": snapshot(vacation)},
            )
            await uow.commit()
            return vacation

    async def delete_vacation(self, identifier: str, context: RequestContext) -> dict[str, bool]:
        actor = context.actor
        assert actor is not None
        authorize(actor, "vacations.delete")
        async with self._factory() as uow:
            await lock_actor(uow, actor)
            vacation = await uow.workforce.vacation(identifier)
            if not vacation:
                raise DomainError("NOT_FOUND", "Отпуск не найден", 404)
            authorize(actor, "vacations.delete", vacation.employee.target())
            await uow.workforce.delete_vacation(identifier)
            await audit(
                uow,
                context,
                "VACATION_DELETE",
                "Vacation",
                identifier,
                {"employeeId": vacation.employeeId},
            )
            await uow.commit()
            return {"success": True}

    async def dashboard(self, year: int, actor: Actor) -> EmployeeDashboard:
        authorize(actor, "employees.read")
        assert actor.access is not None
        async with self._factory() as uow:
            employees = await uow.employees.list("active", datetime.now(), actor.access)
            positions = await self._positions(uow, actor)
            departments = await uow.workforce.departments()
            vacations = await uow.workforce.vacations(year, actor.access)
            actions = (await uow.workforce.actions(actor.access))[:100]
            return EmployeeDashboard(
                tuple(employees),
                tuple(positions),
                tuple(departments),
                tuple(vacations),
                tuple(actions),
            )
