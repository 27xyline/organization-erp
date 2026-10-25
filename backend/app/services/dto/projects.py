"Чистые команды приложения. В операциях patch явно сохраняются отсутствующие поля."

from dataclasses import asdict, dataclass
from decimal import Decimal
from typing import Any


@dataclass(frozen=True, slots=True)
class ProjectCommand:
    code: str
    name: str
    description: str | None = None
    goals: str | None = None
    tasks: str | None = None
    results: str | None = None
    startDate: str | None = None
    endDate: str | None = None
    status: str = "ACTIVE"
    plannedBudget: Decimal = Decimal(0)
    actualBudget: Decimal = Decimal(0)
    templateId: str | None = None


@dataclass(frozen=True, slots=True)
class ChecklistCommand:
    title: str
    completed: bool = False


@dataclass(frozen=True, slots=True)
class TaskCommand:
    name: str | None = None
    description: str | None = None
    priority: str | None = None
    risk: str | None = None
    isMilestone: bool | None = None
    level: int = 1
    parentId: str | None = None
    startDate: str | None = None
    endDate: str | None = None
    duration: int | None = None
    progress: int | None = None
    status: str | None = None
    employeeIds: tuple[str, ...] = ()
    predecessorIds: tuple[str, ...] = ()
    checklist: tuple[ChecklistCommand, ...] = ()
    present_fields: frozenset[str] = frozenset()

    @classmethod
    def from_values(cls, values: dict[str, Any]) -> "TaskCommand":
        data = dict(values)
        for key in ("employeeIds", "predecessorIds"):
            if key in data:
                data[key] = tuple(data[key])
        if "checklist" in data:
            data["checklist"] = tuple(ChecklistCommand(**item) for item in data["checklist"])
        return cls(**data, present_fields=frozenset(values))

    @property
    def values(self) -> dict[str, Any]:
        values = asdict(self)
        return {key: value for key, value in values.items() if key in self.present_fields}


@dataclass(frozen=True, slots=True)
class ProjectListQuery:
    page: int = 1
    page_size: int = 25
    status: str | None = None
