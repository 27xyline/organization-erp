"""Typed application inputs; transport validation lives in API schemas."""

from dataclasses import asdict, dataclass, field
from datetime import datetime
from decimal import Decimal


@dataclass(frozen=True, slots=True)
class AssetCommand:
    name: str
    inventoryNumber: str
    unitPrice: Decimal
    unitOfMeasure: str
    quantity: Decimal
    molId: str
    groupId: str
    recordingDate: datetime
    documentType: str
    documentDetails: str
    projectId: str | None = None
    contractCode: str | None = None
    internalFundingCode: str | None = None
    isExistingAsset: bool = False
    documentFiles: list[str] = field(default_factory=list)
    status: str = "IN_STOCK"
    notes: str | None = None
    plannedDisposalDate: datetime | None = None
    plannedDisposalReason: str | None = None
    photos: list[str] = field(default_factory=list)
    accountingForm: str = "145"
    editReason: str | None = None
    isArchived: bool | None = None

    def values(self) -> dict[str, object]:
        values = asdict(self)
        values.pop("editReason")
        values.pop("isArchived")
        values["projectId"] = self.projectId or None
        return values


@dataclass(frozen=True, slots=True)
class MovementCommand:
    fromMolId: str
    quantity: Decimal
    date: datetime
    documentType: str
    documentDetails: str
    toMolId: str | None = None
    reason: str | None = None
    documentFiles: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class AssetQuery:
    page: int = 1
    pageSize: int = 25
    search: str | None = None
    molId: str | None = None
    groupId: str | None = None
    status: str | None = None
    accountingForm: str | None = None
    dateFrom: str | None = None
    dateTo: str | None = None
    archived: bool = False


@dataclass(frozen=True, slots=True)
class OperationQuery:
    page: int = 1
    pageSize: int = 25
    assetId: str | None = None
    type: str | None = None


@dataclass(frozen=True, slots=True)
class InventoryCommand:
    name: str
    molId: str


@dataclass(frozen=True, slots=True)
class CountCommand:
    inventoryNumber: str
    foundQuantity: Decimal
    note: str | None = None


@dataclass(frozen=True, slots=True)
class MaintenanceCommand:
    type: str | None = None
    title: str | None = None
    description: str | None = None
    scheduledDate: datetime | None = None
    nextDueDate: datetime | None = None
    provider: str | None = None
    cost: Decimal | None = None
    status: str | None = None
    startedAt: datetime | None = None
    completedAt: datetime | None = None
    result: str | None = None
    present: frozenset[str] = frozenset()


@dataclass(frozen=True, slots=True)
class SavedViewCommand:
    name: str
    filters: dict[str, str]
