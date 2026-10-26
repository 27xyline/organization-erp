"Типизированные команды приложения, не зависящие от входных моделей Pydantic."

from dataclasses import asdict, dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any

from app.domain.ports.employees import ActionItem, EmployeeItem, PositionSummary, VacationItem


@dataclass(frozen=True, slots=True)
class EmployeeCommand:
    code: str | None = None
    fullName: str | None = None
    department: str | None = None
    photo: str | None = None
    phone: str | None = None
    email: str | None = None
    contractType: str | None = None
    contractSignedDate: str | datetime | None = None
    contractEndDate: str | datetime | None = None
    contractNumber: str | None = None
    staffScheduleId: str | None = None
    employmentRate: Decimal | None = None
    status: str | None = None
    hireDescription: str | None = None
    fields: frozenset[str] = frozenset()

    def changes(self) -> dict[str, Any]:
        values = asdict(self)
        return {key: values[key] for key in self.fields if key not in ("fields", "hireDescription")}


@dataclass(frozen=True, slots=True)
class EmployeeListQuery:
    scope: str = "all"
    page: int = 1
    page_size: int = 50


@dataclass(frozen=True, slots=True)
class StaffCommand:
    position: str
    rate: Decimal
    salary: Decimal
    departmentId: str | None = None
    department: str | None = None


@dataclass(frozen=True, slots=True)
class VacationCommand:
    employeeId: str
    startDate: str
    endDate: str
    type: str = "VACATION"


@dataclass(frozen=True, slots=True)
class PersonnelActionCommand:
    type: str
    date: str
    description: str | None = None
    employeeId: str | None = None
    employeeData: EmployeeCommand | None = None
    staffScheduleId: str | None = None
    employmentRate: Decimal | None = None
    newDepartment: str | None = None
    newPosition: str | None = None
    newContractEndDate: str | None = None


@dataclass(frozen=True, slots=True)
class SkillCommand:
    name: str
    level: int | None = None


@dataclass(frozen=True, slots=True)
class CertificateCommand:
    name: str
    issuer: str | None = None
    number: str | None = None
    issuedAt: str | None = None
    expiresAt: str | None = None


@dataclass(frozen=True, slots=True)
class ProfileCommand:
    skills: tuple[SkillCommand, ...]
    certificates: tuple[CertificateCommand, ...]
    birthDate: str | None = None
    education: str | None = None
    qualification: str | None = None
    managerId: str | None = None


@dataclass(frozen=True, slots=True)
class EmployeeDashboard:
    employees: tuple["EmployeeItem", ...]
    staff_schedule: tuple["PositionSummary", ...]
    departments: tuple[dict[str, Any], ...]
    vacations: tuple["VacationItem", ...]
    personnel_actions: tuple["ActionItem", ...]


@dataclass(frozen=True, slots=True)
class EmployeeReferenceQuery:
    project_id: str
