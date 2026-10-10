"""Detached dataclasses for department application results."""

from dataclasses import dataclass

from app.domain.ports.departments import DepartmentItem, EmployeeCandidate


@dataclass(frozen=True, slots=True)
class DepartmentCommand:
    code: str | None = None
    name: str | None = None
    parent_id: str | None = None
    head_employee_id: str | None = None
    is_active: bool | None = None
    parent_id_set: bool = False
    head_employee_id_set: bool = False


@dataclass(frozen=True, slots=True)
class DepartmentListQuery:
    active_only: bool = False


@dataclass(frozen=True, slots=True)
class DepartmentReferences:
    parent_candidates: tuple[DepartmentItem, ...]
    head_candidates: tuple[EmployeeCandidate, ...]
