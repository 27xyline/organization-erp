"""Employee persistence and bounded read composition on one AsyncSession."""

from __future__ import annotations

import builtins
from collections.abc import Callable
from datetime import datetime
from typing import Any

from sqlalchemy import delete, false, func, or_, select, true, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql.elements import ColumnElement

from app.domain.auth.rules import AccessContext
from app.domain.ports.employees import EmployeeItem, ProfileComposition, StaffItem
from app.models.assets import Asset, AssetHolding
from app.models.catalogs import Mol
from app.models.departments import Department
from app.models.documents import Document
from app.models.employees import Employee, EmployeeCertificate, EmployeeSkill
from app.models.finance import PersonnelAction, SalaryEntry
from app.models.projects import Project, ProjectMember, TaskAssignee
from app.models.timekeeping import StaffSchedule, Vacation
from app.repositories.departments import _flush


def columns(row: Any) -> dict[str, Any]:
    return {column.key: getattr(row, column.key) for column in row.__table__.columns}


def staff_item(row: StaffSchedule) -> StaffItem:
    return StaffItem(**columns(row), department_active=row.departmentRef.isActive)


def employee_item(row: Employee) -> EmployeeItem:
    return EmployeeItem(
        **columns(row), staffSchedule=staff_item(row.staffSchedule) if row.staffSchedule else None
    )


def employee_loads() -> Any:
    return selectinload(Employee.staffSchedule).selectinload(StaffSchedule.departmentRef)


def visible(employee: EmployeeItem, access: AccessContext, permission: str) -> bool:
    return access.allows(permission, employee.target())


def employee_scope(access: AccessContext, permission: str) -> ColumnElement[bool]:
    clauses: list[ColumnElement[bool]] = []
    for grant in access.grants_for(permission):
        if grant.department_scope_mode == "ALL":
            return true()
        if grant.department_scope_mode == "SELF":
            if access.employee_id:
                clauses.append(Employee.id == access.employee_id)
        elif grant.department_scope_mode == "ASSIGNED":
            clauses.append(Employee.departmentId.in_(grant.department_ids))
    return or_(*clauses) if clauses else false()


def employee_query(scope: str, today: datetime, access: AccessContext, permission: str) -> Any:
    query = select(Employee).where(employee_scope(access, permission))
    if scope == "active":
        query = query.where(Employee.status != "DISMISSED")
    elif scope == "archive":
        query = query.where(
            (Employee.status == "DISMISSED")
            | ((Employee.status != "DISMISSED") & (Employee.contractEndDate < today))
        )
    elif scope == "expired":
        query = query.where(Employee.status != "DISMISSED", Employee.contractEndDate < today)
    return query


class SqlAlchemyEmployeeRepository:
    def __init__(self, session: Callable[[], AsyncSession]) -> None:
        self._session = session

    async def project_exists(self, identifier: str) -> bool:
        return (
            await self._session().scalar(select(Project.id).where(Project.id == identifier))
            is not None
        )

    async def available_for_project(self, identifier: str) -> builtins.list[EmployeeItem]:
        active_members = select(ProjectMember.employeeId).where(
            ProjectMember.projectId == identifier, ProjectMember.isArchived.is_(False)
        )
        rows = await self._session().scalars(
            select(Employee)
            .where(Employee.status != "DISMISSED", Employee.id.not_in(active_members))
            .options(employee_loads())
            .order_by(Employee.fullName)
        )
        return [employee_item(row) for row in rows]

    async def get(self, identifier: str) -> EmployeeItem | None:
        row = await self._session().scalar(
            select(Employee)
            .where(Employee.id == identifier)
            .options(employee_loads())
            .execution_options(populate_existing=True)
        )
        return employee_item(row) if row else None

    async def list(
        self, scope: str, today: datetime, access: AccessContext, permission: str = "employees.read"
    ) -> builtins.list[EmployeeItem]:
        query = employee_query(scope, today, access, permission).options(employee_loads())
        query = query.order_by(
            Employee.createdAt.desc() if scope == "all" else Employee.fullName.asc()
        )
        return [employee_item(row) for row in await self._session().scalars(query)]

    async def list_page(
        self, scope: str, today: datetime, access: AccessContext, page: int, page_size: int
    ) -> tuple[builtins.list[EmployeeItem], int]:
        query = employee_query(scope, today, access, "employees.read")
        total = await self._session().scalar(select(func.count()).select_from(query.subquery()))
        query = (
            query.options(employee_loads())
            .order_by(Employee.createdAt.desc() if scope == "all" else Employee.fullName.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return [employee_item(row) for row in await self._session().scalars(query)], total or 0

    async def create(self, data: dict[str, Any]) -> EmployeeItem:
        row = Employee(**data)
        self._session().add(row)
        await _flush(self._session())
        result = await self.get(row.id)
        assert result is not None
        return result

    async def update(self, identifier: str, data: dict[str, Any]) -> EmployeeItem:
        row = await self._session().get(Employee, identifier)
        assert row is not None
        for key, value in data.items():
            setattr(row, key, value)
        await _flush(self._session())
        result = await self.get(identifier)
        assert result is not None
        return result

    async def clear_leadership(self, identifier: str) -> builtins.list[dict[str, Any]]:
        rows = (
            (
                await self._session().execute(
                    select(Department.id, Department.code, Department.name).where(
                        Department.headEmployeeId == identifier
                    )
                )
            )
            .mappings()
            .all()
        )
        await self._session().execute(
            update(Department)
            .where(Department.headEmployeeId == identifier)
            .values(headEmployeeId=None)
        )
        await _flush(self._session())
        return [dict(row) for row in rows]

    async def replace_profile(
        self,
        identifier: str,
        skills: tuple[dict[str, Any], ...],
        certificates: tuple[dict[str, Any], ...],
    ) -> None:
        session = self._session()
        await session.execute(delete(EmployeeSkill).where(EmployeeSkill.employeeId == identifier))
        await session.execute(
            delete(EmployeeCertificate).where(EmployeeCertificate.employeeId == identifier)
        )
        session.add_all([EmployeeSkill(employeeId=identifier, **data) for data in skills])
        session.add_all(
            [EmployeeCertificate(employeeId=identifier, **data) for data in certificates]
        )
        await _flush(session)

    async def profile(self, employee: EmployeeItem, access: AccessContext) -> ProfileComposition:
        session = self._session()
        identifier = employee.id
        manager_row = (
            await session.get(Employee, employee.managerId) if employee.managerId else None
        )
        reports = await session.scalars(
            select(Employee)
            .where(Employee.managerId == identifier, Employee.status != "DISMISSED")
            .options(employee_loads())
            .order_by(Employee.fullName)
        )
        direct_reports = tuple(
            {
                "id": row.id,
                "fullName": row.fullName,
                "staffSchedule": {"position": row.staffSchedule.position}
                if row.staffSchedule
                else None,
            }
            for row in reports
        )
        skills = tuple(
            {"id": row.id, "name": row.name, "level": row.level}
            for row in await session.scalars(
                select(EmployeeSkill)
                .where(EmployeeSkill.employeeId == identifier)
                .order_by(EmployeeSkill.name)
            )
        )
        certificates = tuple(
            {
                key: getattr(row, key)
                for key in ("id", "name", "issuer", "number", "issuedAt", "expiresAt")
            }
            for row in await session.scalars(
                select(EmployeeCertificate)
                .where(EmployeeCertificate.employeeId == identifier)
                .order_by(
                    EmployeeCertificate.expiresAt.asc().nulls_last(), EmployeeCertificate.name
                )
            )
        )
        actions = tuple(
            columns(row)
            for row in await session.scalars(
                select(PersonnelAction)
                .where(PersonnelAction.employeeId == identifier)
                .order_by(PersonnelAction.date.desc())
                .limit(30)
            )
        )
        salary_entries = tuple(
            {key: getattr(row, key) for key in ("id", "year", "month", "amount")}
            for row in await session.scalars(
                select(SalaryEntry)
                .where(SalaryEntry.employeeId == identifier)
                .order_by(SalaryEntry.year.desc(), SalaryEntry.month.desc())
                .limit(24)
            )
        )
        members = (
            await session.scalars(
                select(ProjectMember)
                .where(ProjectMember.employeeId == identifier, ProjectMember.isArchived.is_(False))
                .options(selectinload(ProjectMember.project))
                .join(Project)
                .order_by(Project.name)
            )
        ).all()
        member_ids = [row.id for row in members]
        counts = dict(
            (
                await session.execute(
                    select(TaskAssignee.projectMemberId, func.count())
                    .where(TaskAssignee.projectMemberId.in_(member_ids))
                    .group_by(TaskAssignee.projectMemberId)
                )
            ).all()
        )
        projects = tuple(
            {
                "id": row.id,
                "department": row.department,
                "position": row.position,
                "rate": row.rate,
                "salary": row.salary,
                "taskCount": counts.get(row.id, 0),
                "project": {
                    key: getattr(row.project, key) for key in ("id", "code", "name", "status")
                },
            }
            for row in members
        )
        vacations = tuple(
            {key: getattr(row, key) for key in ("id", "type", "startDate", "endDate")}
            for row in await session.scalars(
                select(Vacation)
                .where(Vacation.employeeId == identifier)
                .order_by(Vacation.startDate.desc())
                .limit(12)
            )
        )
        mol_row = await session.scalar(select(Mol).where(Mol.employeeId == identifier))
        mol = None
        if mol_row:
            assets = await session.scalars(
                select(Asset)
                .where(Asset.molId == mol_row.id, Asset.isArchived.is_(False))
                .order_by(Asset.name)
            )
            mol = {
                "id": mol_row.id,
                "code": mol_row.code,
                "storageLocation": mol_row.storageLocation,
                "assets": [
                    {
                        key: getattr(row, key)
                        for key in (
                            "id",
                            "name",
                            "inventoryNumber",
                            "status",
                            "quantity",
                            "totalCost",
                        )
                    }
                    for row in assets
                ],
            }
        documents: builtins.list[dict[str, Any]] = []
        if access.has("documents.read"):
            rows = (
                await session.scalars(
                    select(Document)
                    .where(Document.employeeId == identifier, Document.archivedAt.is_(None))
                    .order_by(Document.updatedAt.desc())
                )
            ).all()
            asset_map = {
                asset.id: asset
                for asset in await session.scalars(
                    select(Asset)
                    .where(Asset.id.in_([row.assetId for row in rows if row.assetId]))
                    .options(selectinload(Asset.mol))
                )
            }
            asset_departments: dict[str, list[str]] = {}
            for asset_id, department_id in await session.execute(
                select(AssetHolding.assetId, Mol.departmentId)
                .join(Mol, Mol.id == AssetHolding.molId)
                .where(AssetHolding.assetId.in_(asset_map), AssetHolding.quantity > 0)
            ):
                asset_departments.setdefault(asset_id, []).append(department_id)
            for row in rows:
                asset = asset_map.get(row.assetId) if row.assetId else None
                if access.allows(
                    "documents.read",
                    {
                        "documentEmployeeId": identifier,
                        "documentEmployeeDepartmentId": employee.departmentId,
                        "documentProjectId": row.projectId,
                        "documentAssetProjectId": asset.projectId if asset else None,
                        "documentAssetDepartmentIds": (
                            (asset.mol.departmentId,) + tuple(asset_departments.get(asset.id, ()))
                        )
                        if asset and asset.mol
                        else (),
                    },
                ):
                    documents.append(
                        {
                            key: getattr(row, key)
                            for key in ("id", "title", "category", "status", "updatedAt")
                        }
                    )
        managers = tuple(
            {"id": row.id, "fullName": row.fullName}
            for row in await self.list("active", datetime.now(), access)
            if row.id != identifier
        )
        return ProfileComposition(
            employee,
            {"id": manager_row.id, "fullName": manager_row.fullName} if manager_row else None,
            direct_reports,
            skills,
            certificates,
            actions,
            salary_entries,
            projects,
            vacations,
            mol,
            tuple(documents),
            managers,
        )
