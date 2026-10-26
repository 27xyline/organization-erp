import re
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

AppRole = Literal[
    "ADMIN",
    "HR",
    "ACCOUNTANT",
    "PROJECT_MANAGER",
    "ASSET_CUSTODIAN",
    "DEPARTMENT_HEAD",
    "AUDITOR",
    "EMPLOYEE",
]
ScopeMode = Literal["NONE", "ALL", "ASSIGNED", "SELF"]


class AssignmentInput(BaseModel):
    model_config = ConfigDict(strict=True)
    role: AppRole
    departmentScopeMode: ScopeMode
    projectScopeMode: ScopeMode
    departmentIds: list[str] = Field(default_factory=list)
    projectIds: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def scopes(self) -> Self:
        for mode, ids in (
            (self.departmentScopeMode, self.departmentIds),
            (self.projectScopeMode, self.projectIds),
        ):
            if (mode == "ASSIGNED") != bool(ids) or any(not item for item in ids):
                raise ValueError("Проверьте области доступа")
        return self


class UserFields(BaseModel):
    model_config = ConfigDict(strict=True)

    @field_validator("name", check_fields=False)
    @classmethod
    def name_clean(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not 2 <= len(value) <= 200:
            raise ValueError("Имя должно содержать от 2 до 200 символов")
        return value

    @field_validator("assignments", check_fields=False)
    @classmethod
    def unique_roles(cls, value: list[AssignmentInput] | None) -> list[AssignmentInput] | None:
        if value is not None and (
            not 1 <= len(value) <= 8 or len({a.role for a in value}) != len(value)
        ):
            raise ValueError("Назначьте уникальные роли")
        return value


class CreateUserInput(UserFields):
    username: str
    name: str
    employeeId: str | None = Field(default=None, min_length=1)
    assignments: list[AssignmentInput]
    temporaryPassword: str = Field(min_length=7, max_length=512)

    @field_validator("username")
    @classmethod
    def username_clean(cls, value: str) -> str:
        value = value.strip().lower()
        if not 3 <= len(value) <= 100 or not re.fullmatch(r"[a-z0-9._-]+", value):
            raise ValueError("Допустимы латинские буквы, цифры, точка, _ и -")
        return value

    @model_validator(mode="after")
    def employee_link(self) -> Self:
        if any(a.role == "EMPLOYEE" for a in self.assignments) and not self.employeeId:
            raise ValueError("Для роли сотрудника привяжите кадровую карточку")
        return self


class UpdateUserInput(UserFields):
    name: str | None = None
    employeeId: str | None = Field(default=None, min_length=1)
    assignments: list[AssignmentInput] | None = None
    isActive: bool | None = None
    temporaryPassword: str | None = Field(default=None, min_length=7, max_length=512)

    @model_validator(mode="after")
    def changes(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Необходимо передать хотя бы одно изменение")
        if any(getattr(self, key) is None for key in self.model_fields_set - {"employeeId"}):
            raise ValueError("Недопустимое пустое значение")
        if (
            self.assignments
            and any(a.role == "EMPLOYEE" for a in self.assignments)
            and "employeeId" in self.model_fields_set
            and self.employeeId is None
        ):
            raise ValueError("Для роли сотрудника привяжите кадровую карточку")
        return self


class ChangePasswordInput(BaseModel):
    model_config = ConfigDict(strict=True)
    currentPassword: str = Field(min_length=1, max_length=512)
    newPassword: str = Field(min_length=7, max_length=512)

    @model_validator(mode="after")
    def differs(self) -> Self:
        if self.currentPassword == self.newPassword:
            raise ValueError("Новый пароль должен отличаться от текущего")
        return self
