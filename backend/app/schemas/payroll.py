from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.finance import PayrollPeriodInput

Cuid = Annotated[str, Field(pattern=r"^c[a-z0-9]{24}$")]


class PayrollMonthQuery(BaseModel):
    year: Annotated[int, Field(ge=2000, le=2100)]
    month: Annotated[int, Field(ge=1, le=12)]

    @field_validator("year", "month", mode="before")
    @classmethod
    def parse_legacy_integer(cls, value: object) -> object:
        if isinstance(value, str):
            try:
                return int(value, 10)
            except ValueError:
                return value
        return value


class PayrollPayslipQuery(PayrollMonthQuery):
    employeeId: Annotated[str, Field(min_length=1)]


class PayrollAdjustmentInput(BaseModel):
    employeeId: Cuid
    projectId: Cuid | None = None
    year: Annotated[int, Field(ge=2000, le=2100)]
    month: Annotated[int, Field(ge=1, le=12)]
    type: Literal["BONUS", "ONE_TIME", "DEDUCTION"]
    amount: Annotated[Decimal, Field(gt=Decimal("0"))]
    description: Annotated[str, Field(min_length=2, max_length=500)]

    @field_validator("description", mode="before")
    @classmethod
    def trim_description(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


__all__ = [
    "PayrollAdjustmentInput",
    "PayrollMonthQuery",
    "PayrollPayslipQuery",
    "PayrollPeriodInput",
]
