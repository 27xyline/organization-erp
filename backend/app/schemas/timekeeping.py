from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

Cuid = Annotated[str, Field(pattern=r"^c[a-z0-9]{24}$")]
TimeEntryTypeName = Literal["REGULAR", "VACATION", "SICK_LEAVE", "BUSINESS_TRIP", "OVERTIME"]


class TimeEntryInput(BaseModel):
    employeeId: Cuid
    projectId: Cuid | None = None
    taskId: Cuid | None = None
    workDate: date
    type: TimeEntryTypeName
    hours: Annotated[Decimal, Field(gt=0, le=24)]
    note: Annotated[str, Field(max_length=500)] | None = None
    correctionReason: Annotated[str, Field(min_length=3, max_length=500)] | None = None

    @field_validator("note", "correctionReason", mode="before")
    @classmethod
    def trim_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class TimeEntryUpdateInput(BaseModel):
    employeeId: Cuid | None = None
    projectId: Cuid | None = None
    taskId: Cuid | None = None
    workDate: date | None = None
    type: TimeEntryTypeName | None = None
    hours: Annotated[Decimal, Field(gt=0, le=24)] | None = None
    note: Annotated[str, Field(max_length=500)] | None = None
    correctionReason: Annotated[str, Field(min_length=3, max_length=500)] | None = None

    @field_validator("note", "correctionReason", mode="before")
    @classmethod
    def trim_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="before")
    @classmethod
    def reject_null_for_non_nullable_fields(cls, value: object) -> object:
        if isinstance(value, dict):
            for field in ("employeeId", "workDate", "type", "hours", "correctionReason"):
                if field in value and value[field] is None:
                    raise ValueError(f"{field} cannot be null")
        return value


class TimeEntryQuery(BaseModel):
    year: Annotated[int, Field(ge=2000, le=2100)]
    month: Annotated[int, Field(ge=1, le=12)]
    employeeId: Cuid | None = None
    projectId: Cuid | None = None


class TimeEntryDeleteInput(BaseModel):
    correctionReason: Annotated[str, Field(min_length=3, max_length=500)] | None = None

    @field_validator("correctionReason", mode="before")
    @classmethod
    def trim_correction_reason(cls, value: object) -> object:
        if value is None:
            return value
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="before")
    @classmethod
    def reject_null_correction_reason(cls, value: object) -> object:
        if (
            isinstance(value, dict)
            and "correctionReason" in value
            and value["correctionReason"] is None
        ):
            raise ValueError("correctionReason cannot be null")
        return value


class SubmitTimesheetInput(BaseModel):
    employeeId: Cuid
    year: Annotated[int, Field(ge=2000, le=2100)]
    month: Annotated[int, Field(ge=1, le=12)]
    zeroHoursConfirmed: bool = False


class TimesheetDecisionInput(BaseModel):
    decision: Literal["APPROVE", "RETURN"]
    reason: Annotated[str, Field(min_length=3, max_length=500)] | None = None

    @field_validator("reason", mode="before")
    @classmethod
    def trim_reason(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def return_requires_reason(self) -> TimesheetDecisionInput:
        if self.decision == "RETURN" and not self.reason:
            raise ValueError("Укажите причину возврата")
        return self
