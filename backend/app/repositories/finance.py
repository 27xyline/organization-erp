from __future__ import annotations

from collections.abc import Callable
from decimal import Decimal

from sqlalchemy import delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.employees import Employee
from app.models.finance import FinancePlanEntry
from app.models.projects import Project, ProjectMember


class SqlAlchemyFinanceRepository:
    """Finance reads and writes bound to the caller-owned SQLAlchemy session."""

    def __init__(self, session: Callable[[], AsyncSession]) -> None:
        self._session = session

    async def employees(self) -> list[Employee]:
        result = await self._session().scalars(
            select(Employee)
            .where(Employee.status != "DISMISSED")
            .options(selectinload(Employee.staffSchedule))
            .order_by(Employee.fullName)
        )
        return list(result.all())

    async def projects_for_plan(self, included_ids: tuple[str, ...] = ()) -> list[Project]:
        status_filter = (
            or_(Project.status == "ACTIVE", Project.id.in_(included_ids))
            if included_ids
            else Project.status == "ACTIVE"
        )
        result = await self._session().scalars(
            select(Project).where(status_filter).order_by(Project.code)
        )
        return list(result.all())

    async def projects(self, identifiers: tuple[str, ...]) -> list[Project]:
        if not identifiers:
            return []
        result = await self._session().scalars(
            select(Project).where(Project.id.in_(identifiers)).order_by(Project.code)
        )
        return list(result.all())

    async def plan_entries(
        self,
        year: int,
        *,
        plan_type: str | None = None,
        employee_ids: tuple[str, ...] = (),
        project_id: str | None = None,
        project_only: bool = False,
    ) -> list[FinancePlanEntry]:
        query = (
            select(FinancePlanEntry)
            .where(FinancePlanEntry.year == year)
            .options(
                selectinload(FinancePlanEntry.project),
                selectinload(FinancePlanEntry.employee),
            )
        )
        if plan_type is not None:
            query = query.where(FinancePlanEntry.type == plan_type)
        if employee_ids:
            query = query.where(FinancePlanEntry.employeeId.in_(employee_ids))
        if project_id is not None:
            query = query.where(FinancePlanEntry.projectId == project_id)
        if project_only:
            query = query.where(FinancePlanEntry.projectId.is_not(None))
        result = await self._session().scalars(
            query.order_by(FinancePlanEntry.month, FinancePlanEntry.employeeId, FinancePlanEntry.id)
        )
        return list(result.all())

    async def cell_entries(
        self,
        employee_id: str,
        year: int,
        month: int,
        plan_type: str,
        project_scope: str | None = None,
    ) -> list[FinancePlanEntry]:
        filters = [
            FinancePlanEntry.employeeId == employee_id,
            FinancePlanEntry.year == year,
            FinancePlanEntry.month == month,
            FinancePlanEntry.type == plan_type,
        ]
        if project_scope is not None:
            filters.append(FinancePlanEntry.projectId == project_scope)
        result = await self._session().scalars(
            select(FinancePlanEntry)
            .where(*filters)
            .options(selectinload(FinancePlanEntry.project))
            .order_by(FinancePlanEntry.id)
        )
        return list(result.all())

    async def project_member(self, project_id: str, employee_id: str) -> ProjectMember | None:
        return await self._session().scalar(
            select(ProjectMember).where(
                ProjectMember.projectId == project_id,
                ProjectMember.employeeId == employee_id,
                ProjectMember.isArchived.is_(False),
            )
        )

    async def project_payroll_members(self, project_id: str) -> list[ProjectMember]:
        result = await self._session().scalars(
            select(ProjectMember)
            .where(ProjectMember.projectId == project_id, ProjectMember.isArchived.is_(False))
            .options(selectinload(ProjectMember.employee))
            .order_by(ProjectMember.department, Employee.fullName)
            .join(Employee, ProjectMember.employeeId == Employee.id)
        )
        return list(result.all())

    async def project(self, project_id: str) -> Project | None:
        return await self._session().get(Project, project_id)

    async def replace_cell(
        self,
        employee_id: str,
        year: int,
        month: int,
        plan_type: str,
        allocations: tuple[tuple[str, Decimal], ...],
        project_scope: str | None = None,
    ) -> list[FinancePlanEntry]:
        session = self._session()
        filters = [
            FinancePlanEntry.employeeId == employee_id,
            FinancePlanEntry.year == year,
            FinancePlanEntry.month == month,
            FinancePlanEntry.type == plan_type,
        ]
        if project_scope is not None:
            filters.append(FinancePlanEntry.projectId == project_scope)
        await session.execute(delete(FinancePlanEntry).where(*filters))
        session.add_all(
            FinancePlanEntry(
                employeeId=employee_id,
                projectId=project_id,
                year=year,
                month=month,
                type=plan_type,
                amount=amount,
            )
            for project_id, amount in allocations
        )
        await session.flush()
        return await self.cell_entries(employee_id, year, month, plan_type, project_scope)

    async def clear_cell(
        self,
        employee_id: str,
        year: int,
        month: int,
        plan_type: str,
        project_scope: str | None = None,
    ) -> None:
        filters = [
            FinancePlanEntry.employeeId == employee_id,
            FinancePlanEntry.year == year,
            FinancePlanEntry.month == month,
            FinancePlanEntry.type == plan_type,
        ]
        if project_scope is not None:
            filters.append(FinancePlanEntry.projectId == project_scope)
        await self._session().execute(delete(FinancePlanEntry).where(*filters))

    async def adjust_project_budgets(
        self, decrements: dict[str, Decimal], increments: dict[str, Decimal]
    ) -> None:
        session = self._session()
        for project_id, amount in decrements.items():
            await session.execute(
                update(Project)
                .where(Project.id == project_id)
                .values(actualBudget=Project.actualBudget - amount)
            )
        for project_id, amount in increments.items():
            await session.execute(
                update(Project)
                .where(Project.id == project_id)
                .values(actualBudget=Project.actualBudget + amount)
            )
