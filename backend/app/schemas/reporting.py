from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

ReportMetric = Literal[
    "headcount",
    "occupiedRate",
    "plannedFot",
    "assetValue",
    "projectBudget",
    "actualFot",
]


class ReportPresetInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=100)
    metrics: list[ReportMetric] = Field(min_length=1)
    groupBy: Literal["department", "project"] | None = None
    filters: dict[str, Any] | None = None
