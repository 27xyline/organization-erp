from __future__ import annotations

from collections.abc import Callable
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.departments import Department
from app.models.employees import Employee
from app.models.enums import EmployeeStatus
from app.models.projects import Project, Task
from app.models.timekeeping import TimeEntry, Timesheet
from app.models.users import User, UserDepartmentScope, UserRoleAssignment


class SqlAlchemyTimekeepingRepository:
    """Запросы и записи учёта рабочего времени в сессии, принадлежащей UoW."""

    def __init__(self, session: Callable[[], AsyncSession]) -> None:
        self._session = session

    async def get_entry(self, identifier: str, *, for_update: bool = False) -> TimeEntry | None:
        query = select(TimeEntry).where(TimeEntry.id == identifier)
        query = query.options(
            selectinload(TimeEntry.employee).selectinload(Employee.staffSchedule),
            selectinload(TimeEntry.project),
            selectinload(TimeEntry.task),
        )
        if for_update:
            query = query.with_for_update()
        return await self._session().scalar(query)

    async def month_entries(self, year: int, month: int) -> list[TimeEntry]:
        start = date(year, month, 1)
        end = date(year + (month == 12), month % 12 + 1, 1)
        result = await self._session().scalars(
            select(TimeEntry)
            .join(Employee, TimeEntry.employeeId == Employee.id)
            .where(TimeEntry.workDate >= start, TimeEntry.workDate < end)
            .options(
                selectinload(TimeEntry.employee).selectinload(Employee.staffSchedule),
                selectinload(TimeEntry.project),
                selectinload(TimeEntry.task),
            )
            .order_by(TimeEntry.workDate, Employee.fullName, TimeEntry.id)
        )
        return list(result.all())

    async def month_timesheets(self, year: int, month: int) -> list[Timesheet]:
        result = await self._session().scalars(
            select(Timesheet)
            .where(Timesheet.year == year, Timesheet.month == month)
            .options(
                selectinload(Timesheet.employee),
                selectinload(Timesheet.submittedBy),
                selectinload(Timesheet.decidedBy),
            )
            .order_by(Timesheet.employeeId)
        )
        return list(result.all())

    async def employee_options(self) -> list[Employee]:
        result = await self._session().scalars(
            select(Employee)
            .where(Employee.status != "DISMISSED")
            .options(selectinload(Employee.staffSchedule))
            .order_by(Employee.fullName)
        )
        return list(result.all())

    async def project_options(self) -> list[dict[str, Any]]:
        session = self._session()
        result = await session.scalars(
            select(Project).where(Project.status == "ACTIVE").order_by(Project.name)
        )
        projects = list(result.all())
        output: list[dict[str, Any]] = []
        for project in projects:
            tasks = await session.execute(
                select(Task.id, Task.name)
                .where(Task.projectId == project.id)
                .order_by(Task.level, Task.name)
            )
            output.append(
                {
                    "id": project.id,
                    "code": project.code,
                    "name": project.name,
                    "tasksList": [{"id": task_id, "name": name} for task_id, name in tasks],
                }
            )
        return output

    async def reviewer_for(self, employee_id: str) -> dict[str, Any] | None:
        session = self._session()
        employee = await session.get(Employee, employee_id)
        if employee is None:
            return None
        department_id = employee.departmentId
        department = await session.get(Department, department_id)
        head_id = department.headEmployeeId if department else None
        parent_id = department.parentId if department else None
        if head_id == employee_id:
            head_id = None
        while head_id is None and parent_id:
            ancestor = await session.get(Department, parent_id)
            if ancestor is None:
                break
            head_id = ancestor.headEmployeeId
            parent_id = ancestor.parentId
        if head_id:
            user = await session.scalar(
                select(User)
                .join(Employee, User.employeeId == Employee.id)
                .where(
                    User.employeeId == head_id,
                    User.isActive.is_(True),
                    Employee.status != EmployeeStatus.DISMISSED,
                )
            )
            if user:
                assignments = list(
                    (
                        await session.scalars(
                            select(UserRoleAssignment).where(
                                UserRoleAssignment.userId == user.id,
                                UserRoleAssignment.role.in_(("ADMIN", "HR", "DEPARTMENT_HEAD")),
                            )
                        )
                    ).all()
                )
                valid = False
                for assignment in assignments:
                    mode = str(assignment.departmentScopeMode)
                    if mode == "ALL":
                        valid = True
                    elif mode == "SELF":
                        linked_employee = await session.get(Employee, user.employeeId)
                        valid = bool(
                            linked_employee and linked_employee.departmentId == department_id
                        )
                    elif mode == "ASSIGNED":
                        scopes = await session.scalars(
                            select(UserDepartmentScope.departmentId).where(
                                UserDepartmentScope.roleAssignmentId == assignment.id
                            )
                        )
                        scope_ids = set(scopes.all())
                        current: str | None = department_id
                        ancestors = {current}
                        while current:
                            node = await session.get(Department, current)
                            current = node.parentId if node else None
                            if current:
                                ancestors.add(current)
                        valid = bool(scope_ids & ancestors)
                    if valid:
                        break
                if valid:
                    return {"approverId": user.id, "approverEmployeeId": head_id, "fallback": False}
        # Повторяет запасной вариант старой HR/admin-логики, если в иерархии нет
        # подходящего руководителя.
        fallback = await session.scalar(
            select(User)
            .join(UserRoleAssignment, UserRoleAssignment.userId == User.id)
            .where(
                User.isActive.is_(True),
                UserRoleAssignment.role.in_(("ADMIN", "HR")),
            )
            .order_by(User.id)
            .limit(1)
        )
        if fallback:
            return {
                "approverId": fallback.id,
                "approverEmployeeId": fallback.employeeId,
                "fallback": True,
            }
        return None

    async def employee(self, identifier: str) -> Employee | None:
        return await self._session().get(Employee, identifier)

    async def project(self, identifier: str) -> Project | None:
        return await self._session().get(Project, identifier)

    async def task(self, identifier: str) -> Task | None:
        return await self._session().get(Task, identifier)

    async def daily_hours(
        self, employee_id: str, work_date: date, exclude_id: str | None = None
    ) -> Decimal:
        query = select(func.coalesce(func.sum(TimeEntry.hours), 0)).where(
            TimeEntry.employeeId == employee_id, TimeEntry.workDate == work_date
        )
        if exclude_id:
            query = query.where(TimeEntry.id != exclude_id)
        return Decimal(await self._session().scalar(query) or 0)

    async def timesheet(
        self, employee_id: str, year: int, month: int, *, for_update: bool = False
    ) -> Timesheet | None:
        query = select(Timesheet).where(
            Timesheet.employeeId == employee_id,
            Timesheet.year == year,
            Timesheet.month == month,
        )
        if for_update:
            query = query.with_for_update()
        return await self._session().scalar(query)

    async def get_timesheet(self, identifier: str, *, for_update: bool = False) -> Timesheet | None:
        query = select(Timesheet).where(Timesheet.id == identifier)
        if for_update:
            query = query.with_for_update()
        return await self._session().scalar(query)

    async def save_entry(self, values: dict[str, Any], identifier: str | None = None) -> TimeEntry:
        session = self._session()
        row = await self.get_entry(identifier, for_update=True) if identifier else None
        if row is None:
            row = TimeEntry(**values)
            session.add(row)
        else:
            for key, value in values.items():
                setattr(row, key, value)
        await session.flush()
        # Сервис формирует публичный JSON-контракт после фиксации UoW;
        # предварительно загрузить все связи, пока активна AsyncSession.
        refreshed = await self.get_entry(row.id)
        assert refreshed is not None
        return refreshed

    async def delete_entry(self, identifier: str) -> None:
        row = await self.get_entry(identifier, for_update=True)
        if row is not None:
            await self._session().delete(row)
            await self._session().flush()

    async def save_timesheet(
        self, values: dict[str, Any], identifier: str | None = None
    ) -> Timesheet:
        session = self._session()
        row = await session.get(Timesheet, identifier, with_for_update=True) if identifier else None
        if row is None:
            row = Timesheet(**values)
            session.add(row)
        else:
            for key, value in values.items():
                setattr(row, key, value)
        await session.flush()
        return row
