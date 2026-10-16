"""Pydantic transport schemas for existing asset contracts."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator, model_validator

from app.domain.errors import DomainError

AssetStatus = Literal[
    "IN_STOCK",
    "IN_USE",
    "UNDER_REPAIR",
    "PLANNED_FOR_DISPOSAL",
    "PARTIALLY_DISPOSED",
    "FULLY_DISPOSED",
]
MaintenanceStatus = Literal["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELED"]


class AssetInput(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=500)]
    inventoryNumber: Annotated[str, Field(min_length=1, max_length=100)]
    unitPrice: Annotated[Decimal, Field(gt=0, allow_inf_nan=False)]
    unitOfMeasure: Annotated[str, Field(min_length=1, max_length=50)]
    quantity: Annotated[Decimal, Field(gt=0, allow_inf_nan=False)]
    molId: Annotated[str, Field(min_length=1)]
    groupId: Annotated[str, Field(min_length=1)]
    recordingDate: datetime
    documentType: Annotated[str, Field(min_length=1, max_length=200)]
    documentDetails: Annotated[str, Field(min_length=1, max_length=500)]
    projectId: str | None = None
    contractCode: Annotated[str | None, Field(max_length=100)] = None
    internalFundingCode: Annotated[str | None, Field(max_length=100)] = None
    isExistingAsset: bool = False
    documentFiles: list[str] = Field(default_factory=list)
    status: AssetStatus = "IN_STOCK"
    notes: Annotated[str | None, Field(max_length=2000)] = None
    plannedDisposalDate: datetime | None = None
    plannedDisposalReason: Annotated[str | None, Field(max_length=500)] = None
    photos: list[str] = Field(default_factory=list)
    accountingForm: Literal["145", "367"] = "145"

    @field_validator("recordingDate", "plannedDisposalDate", mode="before")
    @classmethod
    def legacy_date_failure(cls, value: object, info: ValidationInfo) -> object:
        if value == "" and info.field_name == "plannedDisposalDate":
            return None
        if isinstance(value, str) and value:
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                # Live legacy Zod accepts nonempty strings; Prisma Date rejects them as 500.
                raise DomainError("internal_error", "An unexpected error occurred", 500) from None
        return value

    @field_validator("recordingDate", "plannedDisposalDate")
    @classmethod
    def naive_utc(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is not None:
            return value.astimezone(UTC).replace(tzinfo=None)
        return value


class AssetUpdateInput(AssetInput):
    editReason: Annotated[str, Field(min_length=3, max_length=1000)]
    isArchived: bool | None = None

    @field_validator("editReason", mode="before")
    @classmethod
    def trim_reason(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class MovementInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    fromMolId: Annotated[str, Field(min_length=1)]
    quantity: Annotated[Decimal, Field(gt=0, allow_inf_nan=False)]
    date: datetime
    documentType: Annotated[str, Field(min_length=1, max_length=200)]
    documentDetails: Annotated[str, Field(min_length=1, max_length=500)]
    reason: Annotated[str | None, Field(max_length=1000)] = None
    documentFiles: Annotated[list[str], Field(max_length=50)] = Field(default_factory=list)

    @field_validator("date")
    @classmethod
    def naive_utc(cls, value: datetime) -> datetime:
        return value.astimezone(UTC).replace(tzinfo=None) if value.tzinfo else value


class TransferInput(MovementInput):
    toMolId: Annotated[str, Field(min_length=1)]

    @model_validator(mode="after")
    def different_mol(self) -> TransferInput:
        if self.fromMolId == self.toMolId:
            raise ValueError("Получатель должен отличаться от отправителя")
        return self


class ArchiveInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    reason: Annotated[str, Field(min_length=3, max_length=1000)]


class MaintenanceCreateInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    type: Literal["INSPECTION", "CALIBRATION", "REPAIR", "SERVICE"]
    title: Annotated[str, Field(min_length=2, max_length=200)]
    description: Annotated[str | None, Field(max_length=1000)] = None
    scheduledDate: datetime
    nextDueDate: datetime | None = None
    provider: Annotated[str | None, Field(max_length=200)] = None
    cost: Annotated[Decimal, Field(ge=0, allow_inf_nan=False)] = Decimal(0)

    @field_validator("scheduledDate", "nextDueDate")
    @classmethod
    def naive_utc(cls, value: datetime | None) -> datetime | None:
        return AssetInput.naive_utc(value)


class MaintenanceUpdateInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    status: MaintenanceStatus | None = None
    title: Annotated[str | None, Field(min_length=2, max_length=200)] = None
    description: Annotated[str | None, Field(max_length=1000)] = None
    scheduledDate: datetime | None = None
    nextDueDate: datetime | None = None
    startedAt: datetime | None = None
    completedAt: datetime | None = None
    provider: Annotated[str | None, Field(max_length=200)] = None
    cost: Annotated[Decimal | None, Field(ge=0, allow_inf_nan=False)] = None
    result: Annotated[str | None, Field(max_length=1000)] = None

    @field_validator("scheduledDate", "nextDueDate", "startedAt", "completedAt")
    @classmethod
    def naive_utc(cls, value: datetime | None) -> datetime | None:
        return AssetInput.naive_utc(value)

    @model_validator(mode="after")
    def required_when_present(self) -> MaintenanceUpdateInput:
        for key in ("status", "title", "scheduledDate", "cost"):
            if key in self.model_fields_set and getattr(self, key) is None:
                raise ValueError(f"{key}: cannot be null")
        return self


class InventoryInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: Annotated[str, Field(min_length=3, max_length=120)]
    molId: Annotated[str, Field(min_length=1, max_length=128)]


class CountInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    inventoryNumber: Annotated[str, Field(min_length=1, max_length=100)]
    foundQuantity: Annotated[
        Decimal, Field(ge=0, le=Decimal("99999999.99"), decimal_places=2, allow_inf_nan=False)
    ]
    note: Annotated[str | None, Field(max_length=1000)] = None


class SavedFilters(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    search: Annotated[str | None, Field(max_length=200)] = None
    molId: Annotated[str | None, Field(min_length=1, max_length=128)] = None
    groupId: Annotated[str | None, Field(min_length=1, max_length=128)] = None
    status: AssetStatus | None = None
    accountingForm: Literal["145", "367"] | None = None
    dateFrom: Annotated[str | None, Field(pattern=r"^\d{4}-\d{2}-\d{2}$")] = None
    dateTo: Annotated[str | None, Field(pattern=r"^\d{4}-\d{2}-\d{2}$")] = None

    @model_validator(mode="after")
    def date_order(self) -> SavedFilters:
        if self.dateFrom and self.dateTo and self.dateFrom > self.dateTo:
            raise ValueError("Дата окончания должна быть не раньше даты начала")
        return self


class AssetListFilters(SavedFilters):
    molId: str | None = None
    groupId: str | None = None


class SavedViewInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: Annotated[str, Field(min_length=1, max_length=80)]
    filters: SavedFilters


class ImportAssetInput(AssetInput):
    model_config = ConfigDict(str_strip_whitespace=True)
    unitPrice: Annotated[
        Decimal, Field(gt=0, le=Decimal("99999999.99"), decimal_places=2, allow_inf_nan=False)
    ]
    quantity: Annotated[
        Decimal, Field(gt=0, le=Decimal("99999999.99"), decimal_places=2, allow_inf_nan=False)
    ]

    @model_validator(mode="before")
    @classmethod
    def import_defaults(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        result = dict(value)
        date_value = result.get("recordingDate")
        if not isinstance(date_value, str) or len(date_value) != 10:
            raise ValueError("Укажите корректную дату в формате ГГГГ-ММ-ДД")
        from datetime import date

        date.fromisoformat(date_value)
        result.update(
            projectId=None,
            status="IN_STOCK",
            documentFiles=[],
            plannedDisposalDate=None,
            plannedDisposalReason=None,
            photos=[],
        )
        return result

    @model_validator(mode="after")
    def max_cost(self) -> ImportAssetInput:
        if self.unitPrice * self.quantity > Decimal("9999999999.99"):
            raise ValueError("Итоговая стоимость превышает допустимый предел")
        return self


class ImportCommitInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    assets: Annotated[list[ImportAssetInput], Field(min_length=1, max_length=100)]
