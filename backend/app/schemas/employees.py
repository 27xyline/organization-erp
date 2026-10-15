"""Legacy HTTP validation; business dates/capacity remain pure domain rules."""

import re
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.services.dto.employees import EmployeeCommand, PersonnelActionCommand

Status = Literal["ACTIVE", "ON_VACATION", "ON_SICK_LEAVE", "DISMISSED"]
ContractType = Literal["PRIMARY", "INTERNAL", "EXTERNAL"]


class EmployeeUpdateInput(BaseModel):
    code: Annotated[str, Field(min_length=1, max_length=50)] | None = None
    fullName: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    department: Annotated[str, Field(max_length=200)] | None = None
    phone: Annotated[str, Field(max_length=50)] | None = None
    email: Annotated[str, Field(max_length=200)] | None = None
    photo: str | None = None
    contractType: ContractType | None = None
    contractSignedDate: str | None = None
    contractEndDate: str | None = None
    contractNumber: Annotated[str, Field(min_length=1, max_length=100)] | None = None
    staffScheduleId: str | None = None
    employmentRate: Annotated[Decimal, Field(ge=0)] | None = None
    status: Status | None = None

    @field_validator("code", "fullName", "contractNumber", "contractType", "status", mode="before")
    @classmethod
    def not_nullable(cls, value: Any) -> Any:
        if value is None:
            raise ValueError("Поле не может быть пустым")
        return value

    @field_validator("employmentRate", mode="before")
    @classmethod
    def rate_coercion(cls, value: Any) -> Any:
        return 0 if value is None else value

    @field_validator("contractSignedDate", "contractEndDate", mode="before")
    @classmethod
    def legacy_update_date_coercion(cls, value: Any, info: Any) -> Any:
        # Create uses string dates; only the legacy PUT schema uses z.coerce.date().
        if cls is not EmployeeUpdateInput:
            return value
        if info.field_name == "contractEndDate" and value in (None, ""):
            return value
        if value is None or isinstance(value, (int, float)):
            try:
                parsed = datetime(1970, 1, 1) + timedelta(
                    milliseconds=0 if value is None else value
                )
                return parsed.isoformat(timespec="milliseconds") + "Z"
            except (OverflowError, ValueError):
                raise ValueError("Некорректная дата договора") from None
        return value

    @field_validator("email")
    @classmethod
    def email_valid(cls, value: str | None) -> str | None:
        if value and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Некорректный email")
        return value

    def command(self) -> EmployeeCommand:
        values = self.model_dump()
        return EmployeeCommand(**values, fields=frozenset(self.model_fields_set))


class EmployeeCreateInput(EmployeeUpdateInput):
    code: Annotated[str, Field(min_length=1, max_length=50)]
    fullName: Annotated[str, Field(min_length=1, max_length=200)]
    contractSignedDate: Annotated[str, Field(min_length=1)]
    contractNumber: Annotated[str, Field(min_length=1, max_length=100)]
    staffScheduleId: Annotated[str, Field(min_length=1)]
    employmentRate: Annotated[Decimal, Field(gt=0)]
    contractType: ContractType = "PRIMARY"
    hireDescription: Annotated[str, Field(max_length=500)] | None = None


class StaffInput(BaseModel):
    position: Annotated[str, Field(min_length=1, max_length=200)]
    departmentId: Annotated[str, Field(min_length=1, max_length=100)] | None = None
    department: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    rate: Annotated[Decimal, Field(gt=0)]
    salary: Annotated[Decimal, Field(ge=0)]

    @field_validator("departmentId", "department", mode="before")
    @classmethod
    def strip_reference(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def department_required(self) -> "StaffInput":
        if not self.departmentId and not self.department:
            raise ValueError("Подразделение обязательно")
        return self


class VacationInput(BaseModel):
    employeeId: Annotated[str, Field(min_length=1)]
    startDate: Annotated[str, Field(min_length=1)]
    endDate: Annotated[str, Field(min_length=1)]
    type: Literal["VACATION", "SICK_LEAVE", "BUSINESS_TRIP", "UNPAID_LEAVE"] = "VACATION"


class PersonnelInput(BaseModel):
    type: Literal["HIRE", "DISMISS", "ARCHIVE", "TRANSFER", "EXTEND", "PROMOTE", "EDIT"]
    date: Annotated[str, Field(min_length=1)]
    description: Annotated[str, Field(max_length=2000)] | None = None
    employeeId: str | None = None
    employeeData: Any = None
    staffScheduleId: str | None = None
    employmentRate: Decimal | None = None
    newDepartment: str | None = None
    newPosition: str | None = None
    newContractEndDate: str | None = None

    def command(self) -> PersonnelActionCommand:
        values = self.model_dump(exclude={"employeeData"})
        draft = None
        if isinstance(self.employeeData, dict):
            names = EmployeeCommand.__dataclass_fields__
            data = {
                key: val
                for key, val in self.employeeData.items()
                if key in names and key != "fields"
            }
            if "employmentRate" in data:
                try:
                    data["employmentRate"] = Decimal(str(data["employmentRate"]))
                except Exception:
                    data["employmentRate"] = Decimal("NaN")
            draft = EmployeeCommand(**data, fields=frozenset(data))
        return PersonnelActionCommand(**values, employeeData=draft)


DateOnly = Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}$")]


class SkillInput(BaseModel):
    name: Annotated[str, Field(min_length=2, max_length=100)]
    level: Annotated[int, Field(ge=1, le=5)] | None = None

    @field_validator("name", mode="before")
    @classmethod
    def trim_name(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class CertificateInput(BaseModel):
    name: Annotated[str, Field(min_length=2, max_length=160)]
    issuer: Annotated[str, Field(max_length=160)] | None = None
    number: Annotated[str, Field(max_length=100)] | None = None
    issuedAt: DateOnly | None = None
    expiresAt: DateOnly | None = None

    @field_validator("issuedAt", "expiresAt")
    @classmethod
    def calendar_date(cls, value: str | None) -> str | None:
        if value is not None:
            date.fromisoformat(value)
        return value

    @field_validator("name", "issuer", "number", mode="before")
    @classmethod
    def trim(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class ProfileInput(BaseModel):
    skills: Annotated[list[SkillInput], Field(max_length=50)]
    certificates: Annotated[list[CertificateInput], Field(max_length=50)]
    birthDate: DateOnly | None = None
    education: Annotated[str, Field(max_length=1000)] | None = None
    qualification: Annotated[str, Field(max_length=1000)] | None = None
    managerId: Annotated[str, Field(min_length=1, max_length=128)] | None = None

    @field_validator("birthDate")
    @classmethod
    def calendar_date(cls, value: str | None) -> str | None:
        if value is not None:
            date.fromisoformat(value)
        return value

    @field_validator("education", "qualification", "managerId", mode="before")
    @classmethod
    def trim(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value
