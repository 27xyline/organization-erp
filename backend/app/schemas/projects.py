"""HTTP-only Zod-compatible project/task inputs."""

from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, StrictBool, field_validator, model_validator

Name = Annotated[str, Field(min_length=1, max_length=300)]
Priority = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
Risk = Literal["LOW", "MEDIUM", "HIGH"]
Status = Literal["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "DELAYED"]


def number(value: Any) -> Any:
    if value is None or value == "" or isinstance(value, bool):
        return int(bool(value))
    if isinstance(value, str) and not value.strip():
        return 0
    return value


class ProjectInput(BaseModel):
    code: Annotated[str, Field(min_length=1, max_length=50)]
    name: Name
    description: Annotated[str, Field(max_length=2000)] | None = None
    goals: Annotated[str, Field(max_length=2000)] | None = None
    tasks: Annotated[str, Field(max_length=2000)] | None = None
    results: Annotated[str, Field(max_length=2000)] | None = None
    startDate: str | None = None
    endDate: str | None = None
    status: Literal["ACTIVE", "COMPLETED", "ARCHIVED"] = "ACTIVE"
    plannedBudget: Annotated[Decimal, Field(ge=0)] = Decimal(0)
    actualBudget: Annotated[Decimal, Field(ge=0)] = Decimal(0)
    templateId: Literal["RESEARCH", "PROCUREMENT"] | None = None

    @field_validator("plannedBudget", "actualBudget", mode="before")
    @classmethod
    def coerce_number(cls, value: Any) -> Any:
        return number(value)

    @model_validator(mode="after")
    def dates(self) -> "ProjectInput":
        if self.startDate and self.endDate and self.startDate > self.endDate:
            raise ValueError("Дата окончания должна быть не раньше даты начала")
        return self


class ChecklistInput(BaseModel):
    title: Annotated[str, Field(min_length=1, max_length=200)]
    completed: StrictBool = False

    @field_validator("title", mode="before")
    @classmethod
    def trim(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class TaskUpdateInput(BaseModel):
    name: Name | None = None
    description: Annotated[str, Field(max_length=2000)] | None = None
    priority: Priority | None = None
    risk: Risk | None = None
    isMilestone: StrictBool | None = None
    startDate: str | None = None
    endDate: str | None = None
    duration: Annotated[int, Field(ge=0)] | None = None
    progress: Annotated[int, Field(ge=0, le=100)] | None = None
    status: Status | None = None
    employeeIds: list[Annotated[str, Field(min_length=1)]] | None = None
    predecessorIds: (
        Annotated[list[Annotated[str, Field(min_length=1)]], Field(max_length=50)] | None
    ) = None
    checklist: Annotated[list[ChecklistInput], Field(max_length=100)] | None = None

    @field_validator(
        "name",
        "priority",
        "risk",
        "isMilestone",
        "status",
        "employeeIds",
        "predecessorIds",
        "checklist",
        mode="before",
    )
    @classmethod
    def not_null(cls, value: Any) -> Any:
        if value is None:
            raise ValueError("Поле не может быть пустым")
        return value

    @field_validator("progress", "duration", mode="before")
    @classmethod
    def coerce_number(cls, value: Any, info: Any) -> Any:
        if value is None and info.field_name == "duration":
            return None
        return number(value)

    @field_validator("description", "startDate", "endDate", mode="before")
    @classmethod
    def trim(cls, value: Any, info: Any) -> Any:
        if isinstance(value, str):
            value = value.strip()
            if info.field_name != "description" and not value:
                return None
        return value

    @field_validator("employeeIds", "predecessorIds")
    @classmethod
    def unique(cls, value: list[str] | None) -> list[str] | None:
        return list(dict.fromkeys(value)) if value is not None else None


class TaskCreateInput(TaskUpdateInput):
    name: Name
    priority: Priority = "MEDIUM"
    risk: Risk = "LOW"
    isMilestone: StrictBool = False
    level: Annotated[int, Field(ge=1, le=3)] = 1
    parentId: Annotated[str, Field(min_length=1)] | None = None
    progress: Annotated[int, Field(ge=0, le=100)] = 0
    status: Status = "NOT_STARTED"
    employeeIds: list[Annotated[str, Field(min_length=1)]] = Field(default_factory=list)
    predecessorIds: Annotated[list[Annotated[str, Field(min_length=1)]], Field(max_length=50)] = (
        Field(default_factory=list)
    )
    checklist: Annotated[list[ChecklistInput], Field(max_length=100)] = Field(default_factory=list)

    @field_validator("level", mode="before")
    @classmethod
    def level_number(cls, value: Any) -> Any:
        return number(value)


class CommentInput(BaseModel):
    body: Annotated[str, Field(min_length=1, max_length=2000)]

    @field_validator("body", mode="before")
    @classmethod
    def trim(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class MemberCreateInput(BaseModel):
    employeeId: Annotated[str, Field(min_length=1)]


class MemberUpdateInput(BaseModel):
    isArchived: StrictBool
