"""Typed commands and read models for the asset catalogs."""

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.domain.ports.departments import DepartmentReference


@dataclass(frozen=True, slots=True)
class GroupCommand:
    code: str | None = None
    name: str | None = None
    description: str | None = None
    present_fields: frozenset[str] = frozenset()

    def to_values(self, *, create: bool = False) -> dict[str, Any]:
        values: dict[str, Any] = {}
        for field in ("code", "name", "description"):
            if create or field in self.present_fields:
                values[field] = getattr(self, field)
        return values


@dataclass(frozen=True, slots=True)
class MolCommand:
    code: str | None = None
    department_id: str | None = None
    department: str | None = None
    full_name: str | None = None
    storage_location: str | None = None
    photo: str | None = None
    present_fields: frozenset[str] = frozenset()

    def to_values(self, *, create: bool = False) -> dict[str, Any]:
        aliases = {
            "code": "code",
            "department_id": "departmentId",
            "department": "department",
            "full_name": "fullName",
            "storage_location": "storageLocation",
            "photo": "photo",
        }
        values: dict[str, Any] = {}
        for field, alias in aliases.items():
            if create or field in self.present_fields:
                values[alias] = getattr(self, field)
        return values


@dataclass(frozen=True, slots=True)
class MolReferences:
    departments: tuple["DepartmentReference", ...]
