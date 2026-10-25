"""Контракты HTTP-входных данных для процессов закупки."""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.domain.procurement.inn import is_valid_russian_inn
from app.models.enums import ProcurementStatus


class ProcurementItemInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")
    name: str = Field(min_length=2, max_length=300)
    quantity: Decimal = Field(gt=0, le=1_000_000)
    unit: str = Field(min_length=1, max_length=30)
    unitPrice: Decimal = Field(gt=0, le=1_000_000_000)
    groupId: str | None = Field(default=None, min_length=1, max_length=100)


class _ProcurementFields(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")
    title: str = Field(min_length=3, max_length=300)
    description: str | None = Field(default=None, max_length=2000)
    budgetLimit: Decimal = Field(gt=0, le=10_000_000_000)
    neededBy: date | None = None
    projectId: str | None = Field(default=None, min_length=1, max_length=100)
    documentId: str | None = Field(default=None, min_length=1, max_length=100)
    items: list[ProcurementItemInput] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def validate_budget(self) -> "_ProcurementFields":
        total = sum((item.quantity * item.unitPrice for item in self.items), Decimal(0))
        if total > self.budgetLimit:
            raise ValueError("Стоимость позиций превышает бюджетный лимит")
        return self


class ProcurementCreateInput(_ProcurementFields):
    number: str = Field(min_length=2, max_length=80)


class ProcurementUpdateInput(_ProcurementFields):
    pass


class ProcurementQueryInput(BaseModel):
    page: int = Field(default=1, ge=1)
    pageSize: int = Field(default=25, ge=1, le=100)
    search: str | None = Field(default=None, max_length=200)
    status: ProcurementStatus | None = None


class ApprovalStepForProcurementInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")
    name: str = Field(min_length=2, max_length=120)
    approverId: str = Field(min_length=1, max_length=100)


class ProcurementSubmitInput(BaseModel):
    steps: list[ApprovalStepForProcurementInput] = Field(min_length=1, max_length=10)
    dueAt: datetime | None = None


class SupplierCreateInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")
    name: str = Field(min_length=2, max_length=300)
    taxId: str | None = None
    email: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=500)

    @field_validator("taxId")
    @classmethod
    def validate_tax_id(cls, value: str | None) -> str | None:
        if value is not None and (
            not value.isascii() or not value.isdigit() or len(value) not in (10, 12)
        ):
            raise ValueError("ИНН должен содержать 10 или 12 цифр")
        if value and not is_valid_russian_inn(value):
            raise ValueError("Некорректная контрольная сумма ИНН")
        return value


class ProcurementContractInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")
    supplierId: str = Field(min_length=1, max_length=100)
    number: str = Field(min_length=2, max_length=100)
    amount: Decimal = Field(gt=0, le=10_000_000_000)
    signedAt: date
    deliveryDueAt: date
    documentId: str | None = Field(default=None, min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_dates(self) -> "ProcurementContractInput":
        if self.deliveryDueAt < self.signedAt:
            raise ValueError("Срок поставки не может быть раньше даты договора")
        return self


class ProcurementDeliveryItemInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")
    procurementItemId: str = Field(min_length=1, max_length=100)
    quantity: Decimal = Field(gt=0, le=1_000_000)


class ProcurementDeliveryInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")
    number: str = Field(min_length=1, max_length=100)
    receivedAt: date
    note: str | None = Field(default=None, max_length=1000)
    documentId: str | None = Field(default=None, min_length=1, max_length=100)
    items: list[ProcurementDeliveryItemInput] = Field(min_length=1, max_length=50)


class ProcurementCapitalizeInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")
    inventoryNumber: str = Field(min_length=1, max_length=100)
    molId: str = Field(min_length=1, max_length=100)
    groupId: str | None = Field(default=None, min_length=1, max_length=100)
    accountingForm: Literal["145", "367"] = "145"
    notes: str | None = Field(default=None, max_length=2000)
