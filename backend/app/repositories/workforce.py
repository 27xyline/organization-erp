"""Адаптеры для штатного расписания, отпусков и персонала. \
Блокировкой организации управляет сервис UoW."""

from collections.abc import Callable
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, select, true, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domain.auth.rules import AccessContext
from app.domain.ports.employees import ActionItem, EmployeeItem, StaffItem, VacationItem
from app.models.departments import Department
from app.models.employees import Employee
from app.models.finance import PersonnelAction
from app.models.timekeeping import StaffSchedule, Vacation
from app.repositories.departments import _flush
from app.repositories.employees import (
    columns,
    employee_item,
    employee_loads,
    employee_scope,
    staff_item,
    visible,
)


class SqlAlchemyWorkforceRepository:
    def __init__(self, session: Callable[[], AsyncSession]) -> None:
        self._session = session

    async def position(self, identifier: str) -> StaffItem | None:
        row = await self._session().scalar(
            select(StaffSchedule)
            .where(StaffSchedule.id == identifier)
            .options(selectinload(StaffSchedule.departmentRef))
            .execution_options(populate_existing=True)
        )
        return staff_item(row) if row else None

    async def has_active_employees(self, identifier: str) -> bool:
        return bool(
            await self._session().scalar(
                select(Employee.id)
                .where(Employee.staffScheduleId == identifier, Employee.status != "DISMISSED")
                .limit(1)
            )
        )

    async def occupied_rate(self, identifier: str, exclude_employee: str | None = None) -> Decimal:
        query = select(func.coalesce(func.sum(Employee.employmentRate), 0)).where(
            Employee.staffScheduleId == identifier, Employee.status != "DISMISSED"
        )
        if exclude_employee:
            query = query.where(Employee.id != exclude_employee)
        return Decimal(await self._session().scalar(query) or 0)

    async def positions(self, access: AccessContext) -> list[tuple[StaffItem, list[EmployeeItem]]]:
        rows = await self._session().scalars(
            select(StaffSchedule)
            .where(
                StaffSchedule.departmentId.in_(
                    access.allowed_department_ids("staffSchedule.read") or ()
                )
                if access.allowed_department_ids("staffSchedule.read") is not None
                else true()
            )
            .options(selectinload(StaffSchedule.departmentRef))
            .order_by(StaffSchedule.department, StaffSchedule.position)
        )
        positions = [
            staff_item(row)
            for row in rows
            if access.allows("staffSchedule.read", {"departmentId": row.departmentId})
        ]
        employees = [
            employee_item(row)
            for row in await self._session().scalars(
                select(Employee)
                .where(
                    Employee.status != "DISMISSED",
                    Employee.staffScheduleId.in_([item.id for item in positions]),
                )
                .options(employee_loads())
            )
        ]
        return [
            (
                position,
                [employee for employee in employees if employee.staffScheduleId == position.id],
            )
            for position in positions
        ]

    async def departments(self) -> list[dict[str, Any]]:
        return [
            {key: getattr(row, key) for key in ("id", "code", "name", "isActive")}
            for row in await self._session().scalars(select(Department).order_by(Department.name))
        ]

    async def save_position(self, identifier: str | None, data: dict[str, Any]) -> StaffItem:
        row = (
            await self._session().get(StaffSchedule, identifier)
            if identifier
            else StaffSchedule(**data)
        )
        assert row is not None
        if identifier:
            for key, value in data.items():
                setattr(row, key, value)
        else:
            self._session().add(row)
        await _flush(self._session())
        result = await self.position(row.id)
        assert result is not None
        return result

    async def delete_position(self, identifier: str) -> None:
        await self._session().execute(
            update(Employee)
            .where(Employee.staffScheduleId == identifier, Employee.status == "DISMISSED")
            .values(staffScheduleId=None)
        )
        await self._session().execute(delete(StaffSchedule).where(StaffSchedule.id == identifier))
        await _flush(self._session())

    async def _vacation_item(self, row: Vacation) -> VacationItem:
        return VacationItem(**columns(row), employee=employee_item(row.employee))

    async def vacations(self, year: int, access: AccessContext) -> list[VacationItem]:
        rows = await self._session().scalars(
            select(Vacation)
            .join(Employee, Employee.id == Vacation.employeeId)
            .where(employee_scope(access, "vacations.read"))
            .where(
                Vacation.startDate <= datetime(year, 12, 31, 23, 59, 59, 999000),
                Vacation.endDate >= datetime(year, 1, 1),
            )
            .options(selectinload(Vacation.employee).options(employee_loads()))
            .order_by(Vacation.startDate)
        )
        return [
            await self._vacation_item(row)
            for row in rows
            if visible(employee_item(row.employee), access, "vacations.read")
        ]

    async def vacation(self, identifier: str) -> VacationItem | None:
        row = await self._session().scalar(
            select(Vacation)
            .where(Vacation.id == identifier)
            .options(selectinload(Vacation.employee).options(employee_loads()))
            .execution_options(populate_existing=True)
        )
        return await self._vacation_item(row) if row else None

    async def save_vacation(self, identifier: str | None, data: dict[str, Any]) -> VacationItem:
        row = await self._session().get(Vacation, identifier) if identifier else Vacation(**data)
        assert row is not None
        if identifier:
            for key, value in data.items():
                setattr(row, key, value)
        else:
            self._session().add(row)
        await _flush(self._session())
        result = await self.vacation(row.id)
        assert result is not None
        return result

    async def delete_vacation(self, identifier: str) -> None:
        await self._session().execute(delete(Vacation).where(Vacation.id == identifier))
        await _flush(self._session())

    def _action_item(self, row: PersonnelAction) -> ActionItem:
        return ActionItem(**columns(row), employee=employee_item(row.employee))

    async def actions(self, access: AccessContext) -> list[ActionItem]:
        rows = await self._session().scalars(
            select(PersonnelAction)
            .join(Employee, Employee.id == PersonnelAction.employeeId)
            .where(employee_scope(access, "personnelActions.read"))
            .options(selectinload(PersonnelAction.employee).options(employee_loads()))
            .order_by(PersonnelAction.createdAt.desc())
        )
        return [
            self._action_item(row)
            for row in rows
            if visible(employee_item(row.employee), access, "personnelActions.read")
        ]

    async def action(self, identifier: str) -> ActionItem | None:
        row = await self._session().scalar(
            select(PersonnelAction)
            .where(PersonnelAction.id == identifier)
            .options(selectinload(PersonnelAction.employee).options(employee_loads()))
            .execution_options(populate_existing=True)
        )
        return self._action_item(row) if row else None

    async def create_action(self, data: dict[str, Any]) -> ActionItem:
        row = PersonnelAction(**data)
        self._session().add(row)
        await _flush(self._session())
        result = await self.action(row.id)
        assert result is not None
        return result

    async def delete_action(self, identifier: str) -> None:
        await self._session().execute(
            delete(PersonnelAction).where(PersonnelAction.id == identifier)
        )
        await _flush(self._session())

    async def archive_keys(self, identifiers: tuple[str, ...]) -> set[tuple[str, datetime | None]]:
        rows = await self._session().execute(
            select(PersonnelAction.employeeId, PersonnelAction.newContractEndDate).where(
                PersonnelAction.type == "ARCHIVE", PersonnelAction.employeeId.in_(identifiers)
            )
        )
        return {(row[0], row[1]) for row in rows}
