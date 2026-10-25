"HR-записи и граница хранения данных. ORM-модели не покидают адаптер."

from __future__ import annotations

import builtins
from dataclasses import asdict, dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Protocol

from app.domain.auth.rules import AccessContext


@dataclass(frozen=True, slots=True)
class StaffItem:
    id: str
    position: str
    department: str
    departmentId: str
    rate: Decimal
    salary: Decimal
    createdAt: datetime
    updatedAt: datetime
    department_active: bool = True

    def as_dict(self, *, department_ref: bool = True) -> dict[str, Any]:
        result = asdict(self)
        result.pop("department_active")
        if department_ref:
            result["departmentRef"] = {"isActive": self.department_active}
        return result


@dataclass(frozen=True, slots=True)
class EmployeeItem:
    id: str
    code: str
    fullName: str
    department: str
    departmentId: str
    photo: str | None
    contractType: str
    contractSignedDate: datetime | None
    contractEndDate: datetime | None
    contractNumber: str | None
    phone: str | None
    email: str | None
    birthDate: datetime | None
    education: str | None
    qualification: str | None
    managerId: str | None
    staffScheduleId: str | None
    employmentRate: Decimal
    status: str
    createdAt: datetime
    updatedAt: datetime
    staffSchedule: StaffItem | None = None

    def as_dict(self, *, department_ref: bool = True) -> dict[str, Any]:
        result = asdict(self)
        result["staffSchedule"] = (
            self.staffSchedule.as_dict(department_ref=department_ref)
            if self.staffSchedule
            else None
        )
        return result

    def summary(self) -> dict[str, Any]:
        keys = (
            "id",
            "fullName",
            "department",
            "departmentId",
            "status",
            "contractType",
            "contractSignedDate",
            "contractEndDate",
            "contractNumber",
            "staffScheduleId",
            "employmentRate",
        )
        result = {key: getattr(self, key) for key in keys}
        result["staffSchedule"] = (
            None
            if not self.staffSchedule
            else {
                key: getattr(self.staffSchedule, key)
                for key in ("id", "position", "department", "departmentId")
            }
            | {"departmentRef": {"isActive": self.staffSchedule.department_active}}
        )
        return result

    def target(self) -> dict[str, Any]:
        return {"employeeId": self.id, "departmentId": self.departmentId}


@dataclass(frozen=True, slots=True)
class ActionItem:
    id: str
    type: str
    date: datetime
    description: str | None
    employeeId: str
    oldDepartment: str | None
    newDepartment: str | None
    oldPosition: str | None
    newPosition: str | None
    oldContractEndDate: datetime | None
    newContractEndDate: datetime | None
    createdAt: datetime
    employee: EmployeeItem

    def as_dict(self) -> dict[str, Any]:
        result = asdict(self)
        result["employee"] = self.employee.summary()
        return result


@dataclass(frozen=True, slots=True)
class VacationItem:
    id: str
    startDate: datetime
    endDate: datetime
    type: str
    employeeId: str
    createdAt: datetime
    employee: EmployeeItem

    def as_dict(self) -> dict[str, Any]:
        result = asdict(self)
        result["employee"] = {
            key: getattr(self.employee, key) for key in ("id", "fullName", "department")
        }
        return result


@dataclass(frozen=True, slots=True)
class ProfileComposition:
    employee: EmployeeItem
    manager: dict[str, Any] | None
    direct_reports: tuple[dict[str, Any], ...]
    skills: tuple[dict[str, Any], ...]
    certificates: tuple[dict[str, Any], ...]
    actions: tuple[dict[str, Any], ...]
    salary_entries: tuple[dict[str, Any], ...]
    projects: tuple[dict[str, Any], ...]
    vacations: tuple[dict[str, Any], ...]
    mol: dict[str, Any] | None
    documents: tuple[dict[str, Any], ...]
    managers: tuple[dict[str, Any], ...]


class EmployeeRepository(Protocol):
    async def project_exists(self, identifier: str) -> bool: ...

    async def available_for_project(self, identifier: str) -> builtins.list[EmployeeItem]: ...

    async def get(self, identifier: str) -> EmployeeItem | None: ...
    async def list(
        self, scope: str, today: datetime, access: AccessContext, permission: str = "employees.read"
    ) -> builtins.list[EmployeeItem]: ...
    async def list_page(
        self, scope: str, today: datetime, access: AccessContext, page: int, page_size: int
    ) -> tuple[builtins.list[EmployeeItem], int]: ...

    async def create(self, data: dict[str, Any]) -> EmployeeItem: ...
    async def update(self, identifier: str, data: dict[str, Any]) -> EmployeeItem: ...
    async def clear_leadership(self, identifier: str) -> builtins.list[dict[str, Any]]: ...
    async def profile(
        self, employee: EmployeeItem, access: AccessContext
    ) -> ProfileComposition: ...
    async def replace_profile(
        self,
        identifier: str,
        skills: tuple[dict[str, Any], ...],
        certificates: tuple[dict[str, Any], ...],
    ) -> None: ...


class WorkforceRepository(Protocol):
    async def positions(
        self, access: AccessContext
    ) -> builtins.list[tuple[StaffItem, builtins.list[EmployeeItem]]]: ...
    async def position(self, identifier: str) -> StaffItem | None: ...
    async def has_active_employees(self, identifier: str) -> bool: ...

    async def occupied_rate(
        self, identifier: str, exclude_employee: str | None = None
    ) -> Decimal: ...
    async def departments(self) -> builtins.list[dict[str, Any]]: ...
    async def save_position(self, identifier: str | None, data: dict[str, Any]) -> StaffItem: ...
    async def delete_position(self, identifier: str) -> None: ...
    async def vacations(self, year: int, access: AccessContext) -> builtins.list[VacationItem]: ...
    async def vacation(self, identifier: str) -> VacationItem | None: ...
    async def save_vacation(self, identifier: str | None, data: dict[str, Any]) -> VacationItem: ...
    async def delete_vacation(self, identifier: str) -> None: ...
    async def actions(self, access: AccessContext) -> builtins.list[ActionItem]: ...
    async def action(self, identifier: str) -> ActionItem | None: ...
    async def create_action(self, data: dict[str, Any]) -> ActionItem: ...
    async def delete_action(self, identifier: str) -> None: ...
    async def archive_keys(
        self, identifiers: tuple[str, ...]
    ) -> set[tuple[str, datetime | None]]: ...


@dataclass(frozen=True, slots=True)
class PositionSummary:
    position: StaffItem
    employees: tuple[EmployeeItem, ...]
    occupied_rate: Decimal
    free_rate: Decimal

    def as_dict(self) -> dict[str, Any]:
        return self.position.as_dict() | {
            "employees": [employee.as_dict() for employee in self.employees],
            "occupiedRate": float(self.occupied_rate),
            "freeRate": float(self.free_rate),
        }


@dataclass(frozen=True, slots=True)
class ProjectEmployeeReference:
    id: str
    code: str
    fullName: str
    department: str
    position: str
    rate: str
    salary: str

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)
