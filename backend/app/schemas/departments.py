"""HTTP payloads for the department module."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

DepartmentCode = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=50,
        pattern=r"^[\p{L}\p{N}._-]+$",
    ),
]
DepartmentName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]
NullableId = Annotated[
    str | None, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]


class DepartmentCreateInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    code: DepartmentCode
    name: DepartmentName
    parent_id: NullableId = Field(default=None, alias="parentId")
    head_employee_id: NullableId = Field(default=None, alias="headEmployeeId")
    is_active: bool = Field(default=True, alias="isActive")

    @model_validator(mode="before")
    @classmethod
    def empty_reference_is_null(cls, value: object) -> object:
        if isinstance(value, dict):
            value = dict(value)
            for key in ("parentId", "headEmployeeId", "parent_id", "head_employee_id"):
                if value.get(key) == "":
                    value[key] = None
        return value


class DepartmentUpdateInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    code: DepartmentCode = None  # type: ignore[assignment]
    name: DepartmentName = None  # type: ignore[assignment]
    parent_id: NullableId = Field(default=None, alias="parentId")
    head_employee_id: NullableId = Field(default=None, alias="headEmployeeId")
    is_active: bool = Field(default=None, alias="isActive")  # type: ignore[assignment]

    @model_validator(mode="before")
    @classmethod
    def require_changed_field(cls, value: object) -> object:
        if isinstance(value, dict) and not value:
            raise ValueError("Укажите хотя бы одно изменяемое поле")
        return value

    @model_validator(mode="after")
    def reject_null_nonnullable_fields(self) -> "DepartmentUpdateInput":
        if not self.model_fields_set:
            raise ValueError("Укажите хотя бы одно изменяемое поле")
        for field in ("code", "name", "is_active"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} не может быть null")
        return self

    @model_validator(mode="before")
    @classmethod
    def empty_reference_is_null(cls, value: object) -> object:
        if isinstance(value, dict):
            value = dict(value)
            for key in ("parentId", "headEmployeeId", "parent_id", "head_employee_id"):
                if value.get(key) == "":
                    value[key] = None
        return value


class DepartmentListItemSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    code: str
    name: str
    parent_id: str | None = Field(alias="parentId")
    head_employee_id: str | None = Field(alias="headEmployeeId")
    head_employee: dict[str, str] | None = Field(alias="headEmployee")
    is_active: bool = Field(alias="isActive")
    usage: dict[str, int]
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class DepartmentListQuery(BaseModel):
    active_only: Literal["true", "false"] = Field(default="false", alias="activeOnly")
