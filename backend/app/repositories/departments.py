"""Репозитории SQLAlchemy для отделов, МОЛ и групп основных средств."""

from collections.abc import Callable
from typing import Any

from sqlalchemy import func, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domain.errors import PersistenceConflict
from app.domain.ports.departments import (
    AssetGroupItem,
    DepartmentItem,
    DepartmentReference,
    EmployeeCandidate,
    MolItem,
)
from app.models.assets import Asset, AssetHolding
from app.models.catalogs import AssetGroup, Mol
from app.models.departments import Department
from app.models.employees import Employee
from app.models.enums import EmployeeStatus
from app.models.timekeeping import StaffSchedule


def constraint_name(error: IntegrityError) -> str:
    original: Any = error.orig
    visited: set[int] = set()
    while original is not None and id(original) not in visited:
        visited.add(id(original))
        name = getattr(original, "constraint_name", None)
        if name:
            return str(name)
        diagnostic = getattr(original, "diag", None)
        name = getattr(diagnostic, "constraint_name", None)
        if name:
            return str(name)
        original = getattr(original, "orig", None) or getattr(original, "__cause__", None)
    return ""


async def _flush(session: AsyncSession) -> None:
    try:
        await session.flush()
    except IntegrityError as error:
        raise PersistenceConflict(constraint_name(error)) from error


class SqlAlchemyDepartmentRepository:
    def __init__(self, session: Callable[[], AsyncSession]) -> None:
        self._session = session

    async def lock_organization_mutation(self) -> None:
        await self._session().execute(text("SELECT pg_advisory_xact_lock(904202607)"))

    async def _item(self, department: Department) -> DepartmentItem:
        session = self._session()
        usage = {
            "children": await session.scalar(
                select(func.count())
                .select_from(Department)
                .where(Department.parentId == department.id)
            ),
            "employees": await session.scalar(
                select(func.count())
                .select_from(Employee)
                .where(Employee.departmentId == department.id)
            ),
            "staffPositions": await session.scalar(
                select(func.count())
                .select_from(StaffSchedule)
                .where(StaffSchedule.departmentId == department.id)
            ),
            "mols": await session.scalar(
                select(func.count()).select_from(Mol).where(Mol.departmentId == department.id)
            ),
        }
        head = department.headEmployee
        return DepartmentItem(
            id=department.id,
            code=department.code,
            name=department.name,
            parent_id=department.parentId,
            head_employee_id=department.headEmployeeId,
            head_employee={"id": head.id, "code": head.code, "fullName": head.fullName}
            if head
            else None,
            is_active=department.isActive,
            usage={key: int(value or 0) for key, value in usage.items()},
            created_at=department.createdAt,
            updated_at=department.updatedAt,
        )

    async def get(self, department_id: str) -> DepartmentItem | None:
        department = await self._session().scalar(
            select(Department)
            .options(selectinload(Department.headEmployee))
            .where(Department.id == department_id)
        )
        return await self._item(department) if department else None

    async def list_visible(
        self, *, active_only: bool = False, allowed_ids: tuple[str, ...] | None = None
    ) -> list[DepartmentItem]:
        statement = select(Department).options(selectinload(Department.headEmployee))
        if active_only:
            statement = statement.where(Department.isActive.is_(True))
        if allowed_ids is not None:
            statement = statement.where(Department.id.in_(allowed_ids))
        departments = list(await self._session().scalars(statement.order_by(Department.name.asc())))
        return [await self._item(department) for department in departments]

    async def parent_links(self) -> tuple[tuple[str, str | None], ...]:
        rows = await self._session().execute(select(Department.id, Department.parentId))
        return tuple((identifier, parent_id) for identifier, parent_id in rows)

    async def find_duplicate(
        self, code: str, name: str, *, exclude_id: str | None = None
    ) -> tuple[str, str] | None:
        statement = select(Department.code, Department.name).where(
            (func.lower(Department.code) == code.lower())
            | (func.lower(Department.name) == name.lower())
        )
        if exclude_id:
            statement = statement.where(Department.id != exclude_id)
        row = (await self._session().execute(statement.limit(1))).first()
        return (row.code, row.name) if row else None

    async def head_is_active(self, employee_id: str) -> bool:
        return bool(
            await self._session().scalar(
                select(Employee.id).where(
                    Employee.id == employee_id, Employee.status != EmployeeStatus.DISMISSED
                )
            )
        )

    async def head_candidates(self) -> list[EmployeeCandidate]:
        rows = await self._session().execute(
            select(Employee.id, Employee.code, Employee.fullName, Employee.departmentId)
            .where(Employee.status != EmployeeStatus.DISMISSED)
            .order_by(Employee.fullName.asc())
        )
        return [EmployeeCandidate(row.id, row.code, row.fullName, row.departmentId) for row in rows]

    async def create(self, values: dict[str, Any]) -> DepartmentItem:
        department = Department(**values)
        session = self._session()
        session.add(department)
        await _flush(session)
        await session.refresh(department)
        return await self._item(department)

    async def update(self, department_id: str, values: dict[str, Any]) -> DepartmentItem | None:
        department = await self._session().get(Department, department_id)
        if department is None:
            return None
        for key, value in values.items():
            setattr(department, key, value)
        await _flush(self._session())
        return await self.get(department_id)

    async def delete(self, department_id: str) -> None:
        department = await self._session().get(Department, department_id)
        if department is not None:
            await self._session().delete(department)
            await _flush(self._session())

    async def update_department_snapshots(self, department_id: str, name: str) -> None:
        await self._session().execute(
            update(Employee).where(Employee.departmentId == department_id).values(department=name)
        )
        await self._session().execute(
            update(StaffSchedule)
            .where(StaffSchedule.departmentId == department_id)
            .values(department=name)
        )
        await self._session().execute(
            update(Mol).where(Mol.departmentId == department_id).values(department=name)
        )


class SqlAlchemyGroupRepository:
    def __init__(self, session: Callable[[], AsyncSession]) -> None:
        self._session = session

    @staticmethod
    def _data(group: AssetGroup, assets: int | None = None) -> AssetGroupItem:
        return AssetGroupItem(
            group.id,
            group.name,
            group.code,
            group.description,
            group.createdAt,
            group.updatedAt,
            assets,
        )

    async def list(self) -> list[AssetGroupItem]:
        groups = await self._session().scalars(select(AssetGroup).order_by(AssetGroup.code.asc()))
        return [self._data(group) for group in groups]

    async def get(self, group_id: str, *, include_usage: bool = False) -> AssetGroupItem | None:
        group = await self._session().get(AssetGroup, group_id)
        if group is None:
            return None
        assets = None
        if include_usage:
            assets = await self._session().scalar(
                select(func.count()).select_from(Asset).where(Asset.groupId == group_id)
            )
        return self._data(group, int(assets or 0) if include_usage else None)

    async def create(self, values: dict[str, Any]) -> AssetGroupItem:
        group = AssetGroup(**values)
        self._session().add(group)
        await _flush(self._session())
        await self._session().refresh(group)
        return self._data(group)

    async def update(self, group_id: str, values: dict[str, Any]) -> AssetGroupItem | None:
        group = await self._session().get(AssetGroup, group_id)
        if group is None:
            return None
        for key, value in values.items():
            setattr(group, key, value)
        await _flush(self._session())
        return self._data(group)

    async def delete(self, group_id: str) -> None:
        group = await self._session().get(AssetGroup, group_id)
        if group is not None:
            await self._session().delete(group)
            await _flush(self._session())


class SqlAlchemyMolRepository:
    def __init__(self, session: Callable[[], AsyncSession]) -> None:
        self._session = session

    @staticmethod
    def _data(mol: Mol, *, usage: tuple[int, int] | None = None) -> MolItem:
        return MolItem(
            mol.id,
            mol.code,
            mol.department,
            mol.departmentId,
            mol.fullName,
            mol.storageLocation,
            mol.photo,
            mol.employeeId,
            mol.createdAt,
            mol.updatedAt,
            usage[0] if usage is not None else None,
            usage[1] if usage is not None else None,
        )

    async def list_visible(self, allowed_ids: tuple[str, ...] | None) -> list[MolItem]:
        statement = select(Mol)
        if allowed_ids is not None:
            statement = statement.where(Mol.departmentId.in_(allowed_ids))
        mols = await self._session().scalars(statement.order_by(Mol.code.asc()))
        return [self._data(mol) for mol in mols]

    async def get_visible(
        self, mol_id: str, allowed_ids: tuple[str, ...] | None, *, include_usage: bool = False
    ) -> MolItem | None:
        statement = select(Mol).where(Mol.id == mol_id)
        if allowed_ids is not None:
            statement = statement.where(Mol.departmentId.in_(allowed_ids))
        mol = await self._session().scalar(statement)
        if mol is None:
            return None
        usage = None
        if include_usage:
            holdings = await self._session().scalar(
                select(func.count()).select_from(AssetHolding).where(AssetHolding.molId == mol_id)
            )
            assets = await self._session().scalar(
                select(func.count()).select_from(Asset).where(Asset.molId == mol_id)
            )
            usage = (int(holdings or 0), int(assets or 0))
        return self._data(mol, usage=usage)

    async def department_target(self, mol_id: str) -> str | None:
        return await self._session().scalar(select(Mol.departmentId).where(Mol.id == mol_id))

    async def resolve_department(
        self, department_id: str | None, department_name: str | None
    ) -> DepartmentReference | None:
        statement = select(Department.id, Department.name, Department.isActive)
        if department_id:
            statement = statement.where(Department.id == department_id)
        else:
            statement = statement.where(
                func.lower(Department.name) == (department_name or "").lower()
            )
        row = (await self._session().execute(statement)).first()
        return DepartmentReference(row.id, row.name, row.isActive) if row else None

    async def create(self, values: dict[str, Any]) -> MolItem:
        mol = Mol(**values)
        self._session().add(mol)
        await _flush(self._session())
        await self._session().refresh(mol)
        return self._data(mol)

    async def update(self, mol_id: str, values: dict[str, Any]) -> MolItem | None:
        mol = await self._session().get(Mol, mol_id)
        if mol is None:
            return None
        for key, value in values.items():
            setattr(mol, key, value)
        await _flush(self._session())
        return self._data(mol)

    async def delete(self, mol_id: str) -> None:
        mol = await self._session().get(Mol, mol_id)
        if mol is not None:
            await self._session().delete(mol)
            await _flush(self._session())
