from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ApprovalStepInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")
    approverId: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=2, max_length=120)


class ApprovalQueryInput(BaseModel):
    page: int = Field(default=1, ge=1)
    pageSize: int = Field(default=25, ge=1, le=100)
    status: Literal["DRAFT", "PENDING", "APPROVED", "REJECTED", "CANCELLED"] | None = None
    search: str | None = Field(default=None, max_length=200)
    assignedToMe: bool | None = None

    @field_validator("assignedToMe", mode="before")
    @classmethod
    def coerce_legacy_boolean(cls, value: object) -> bool | None:
        if value is None:
            return None
        return bool(value)


class ApprovalCreateInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    documentId: str | None = Field(default=None, min_length=1, max_length=128)
    projectId: str | None = Field(default=None, min_length=1, max_length=128)
    entityType: str | None = Field(default=None, max_length=80)
    entityId: str | None = Field(default=None, min_length=1, max_length=128)
    dueAt: datetime | None = None
    steps: list[ApprovalStepInput] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def validate_steps_and_deadline(self) -> "ApprovalCreateInput":
        ids = [step.approverId for step in self.steps]
        if len(ids) != len(set(ids)):
            raise ValueError("Согласующий не должен повторяться")
        if self.dueAt and self.dueAt <= datetime.now(UTC):
            raise ValueError("Срок должен быть в будущем")
        return self


class ApprovalDecisionInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")
    decision: Literal["APPROVE", "REJECT"]
    comment: str | None = Field(default=None, max_length=2000)


class ApprovalTemplateCreateInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")
    name: str = Field(min_length=3, max_length=120)
    steps: list[ApprovalStepInput] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def validate_steps(self) -> "ApprovalTemplateCreateInput":
        ids = [step.approverId for step in self.steps]
        if len(ids) != len(set(ids)):
            raise ValueError("Согласующий не должен повторяться")
        return self


class ApprovalTemplateUpdateInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")
    name: str | None = Field(default=None, min_length=3, max_length=120)
    steps: list[ApprovalStepInput] | None = Field(default=None, min_length=1, max_length=20)
    isActive: bool | None = None

    @model_validator(mode="after")
    def validate_patch(self) -> "ApprovalTemplateUpdateInput":
        if not self.model_fields_set:
            raise ValueError("Укажите хотя бы одно поле для изменения")
        if self.steps is not None:
            ids = [step.approverId for step in self.steps]
            if len(ids) != len(set(ids)):
                raise ValueError("Согласующий не должен повторяться")
        if (
            ("name" in self.model_fields_set and self.name is None)
            or ("steps" in self.model_fields_set and self.steps is None)
            or ("isActive" in self.model_fields_set and self.isActive is None)
        ):
            raise ValueError("Invalid value")
        return self
