from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator


class FinancePlanAllocationInput(BaseModel):
    projectId: Annotated[str | None, Field(min_length=1)] = None
    amount: str | None = None


class FinancePlanSaveInput(BaseModel):
    year: Annotated[int, Field(ge=2000, le=2100)]
    month: Annotated[int, Field(ge=1, le=12)]
    type: Literal["oklad", "nadbavka"]
    employeeId: Annotated[str, Field(min_length=1)]
    projectId: Annotated[str | None, Field(min_length=1)] = None
    amount: str | None = None
    allocations: list[FinancePlanAllocationInput] | None = None


class FinancePlanDeleteInput(BaseModel):
    year: Annotated[int, Field(ge=2000, le=2100)]
    month: Annotated[int, Field(ge=1, le=12)]
    type: Literal["oklad", "nadbavka"]
    employeeId: Annotated[str, Field(min_length=1)]


class ProjectPayrollSaveInput(BaseModel):
    year: Annotated[int, Field(ge=2000, le=2100)]
    month: Annotated[int, Field(ge=1, le=12)]
    employeeId: Annotated[str, Field(min_length=1)]
    okladEnabled: bool
    nadbavkaAmount: str | None = None


class ProjectPayrollDeleteInput(BaseModel):
    year: Annotated[int, Field(ge=2000, le=2100)]
    month: Annotated[int, Field(ge=1, le=12)]
    employeeId: Annotated[str, Field(min_length=1)]


class FinanceYearQuery(BaseModel):
    year: Annotated[int, Field(ge=2000, le=2100)]


class FinancePlanTypeQuery(BaseModel):
    type: Literal["oklad", "nadbavka"]
    year: Annotated[int, Field(ge=2000, le=2100)]


class FinancePlanYearInput(BaseModel):
    year: Annotated[int, Field(ge=2000, le=2100)]

    @field_validator("year", mode="before")
    @classmethod
    def parse_legacy_year(cls, value: object) -> object:
        if isinstance(value, str):
            try:
                return int(value, 10)
            except ValueError:
                return value
        return value
