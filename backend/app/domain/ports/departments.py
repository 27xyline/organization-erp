"""Typed detached records and persistence contracts for organization catalogs."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol


@dataclass(frozen=True, slots=True)
class DepartmentItem:
    id: str
    code: str
    name: str
    parent_id: str | None
    head_employee_id: str | None
    head_employee: dict[str, str] | None
    is_active: bool
    usage: dict[str, int]
    created_at: datetime
    updated_at: datetime

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "parentId": self.parent_id,
            "headEmployeeId": self.head_employee_id,
            "headEmployee": self.head_employee,
            "isActive": self.is_active,
            "usage": self.usage,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }


@dataclass(frozen=True, slots=True)
class DepartmentReference:
    id: str
    name: str
    is_active: bool
    code: str | None = None


@dataclass(frozen=True, slots=True)
class EmployeeCandidate:
    id: str
    code: str
    full_name: str
    department_id: str | None


@dataclass(frozen=True, slots=True)
class AssetGroupItem:
    id: str
    name: str
    code: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    assets: int | None = None

    def as_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "id": self.id,
            "name": self.name,
            "code": self.code,
            "description": self.description,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }
        if self.assets is not None:
            result["_count"] = {"assets": self.assets}
        return result


@dataclass(frozen=True, slots=True)
class MolItem:
    id: str
    code: str
    department: str
    department_id: str
    full_name: str
    storage_location: str
    photo: str | None
    employee_id: str | None
    created_at: datetime
    updated_at: datetime
    holdings: int | None = None
    assets: int | None = None

    def as_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "id": self.id,
            "code": self.code,
            "department": self.department,
            "departmentId": self.department_id,
            "fullName": self.full_name,
            "storageLocation": self.storage_location,
            "photo": self.photo,
            "employeeId": self.employee_id,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }
        if self.holdings is not None and self.assets is not None:
            result["_count"] = {"holdings": self.holdings, "assets": self.assets}
        return result


class DepartmentRepository(Protocol):
    async def lock_organization_mutation(self) -> None: ...
    async def get(self, department_id: str) -> DepartmentItem | None: ...
    async def list_visible(
        self, *, active_only: bool = False, allowed_ids: tuple[str, ...] | None = None
    ) -> list[DepartmentItem]: ...
    async def parent_links(self) -> tuple[tuple[str, str | None], ...]: ...
    async def find_duplicate(
        self, code: str, name: str, *, exclude_id: str | None = None
    ) -> tuple[str, str] | None: ...
    async def head_is_active(self, employee_id: str) -> bool: ...
    async def head_candidates(self) -> list[EmployeeCandidate]: ...
    async def create(self, values: dict[str, Any]) -> DepartmentItem: ...
    async def update(self, department_id: str, values: dict[str, Any]) -> DepartmentItem | None: ...
    async def delete(self, department_id: str) -> None: ...
    async def update_department_snapshots(self, department_id: str, name: str) -> None: ...


class GroupRepository(Protocol):
    async def list(self) -> list[AssetGroupItem]: ...
    async def get(self, group_id: str, *, include_usage: bool = False) -> AssetGroupItem | None: ...
    async def create(self, values: dict[str, Any]) -> AssetGroupItem: ...
    async def update(self, group_id: str, values: dict[str, Any]) -> AssetGroupItem | None: ...
    async def delete(self, group_id: str) -> None: ...


class MolRepository(Protocol):
    async def list_visible(self, allowed_ids: tuple[str, ...] | None) -> list[MolItem]: ...
    async def get_visible(
        self, mol_id: str, allowed_ids: tuple[str, ...] | None, *, include_usage: bool = False
    ) -> MolItem | None: ...
    async def department_target(self, mol_id: str) -> str | None: ...
    async def resolve_department(
        self, department_id: str | None, department_name: str | None
    ) -> DepartmentReference | None: ...
    async def create(self, values: dict[str, Any]) -> MolItem: ...
    async def update(self, mol_id: str, values: dict[str, Any]) -> MolItem | None: ...
    async def delete(self, mol_id: str) -> None: ...
