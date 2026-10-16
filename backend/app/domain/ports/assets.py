"""Detached persistence records and the asset repository boundary."""

from __future__ import annotations

import builtins
from dataclasses import asdict, dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Protocol

from app.domain.auth.rules import AccessContext


@dataclass(frozen=True, slots=True)
class HoldingRecord:
    id: str
    assetId: str
    molId: str
    quantity: Decimal
    createdAt: datetime
    updatedAt: datetime
    mol: dict[str, object] | None = None


@dataclass(frozen=True, slots=True)
class AssetRecord:
    id: str
    orderNumber: int
    name: str
    inventoryNumber: str
    unitPrice: Decimal
    unitOfMeasure: str
    quantity: Decimal
    totalCost: Decimal
    initialCost: Decimal
    usefulLifeMonths: int
    molId: str
    groupId: str
    projectId: str | None
    contractCode: str | None
    internalFundingCode: str | None
    isExistingAsset: bool
    recordingDate: datetime
    documentType: str
    documentDetails: str
    documentFiles: builtins.list[str] | None
    status: str
    isArchived: bool
    plannedDisposalDate: datetime | None
    plannedDisposalReason: str | None
    photos: builtins.list[str] | None
    notes: str | None
    accountingForm: str
    createdAt: datetime
    updatedAt: datetime
    mol: dict[str, object] | None = None
    group: dict[str, object] | None = None
    holdings: tuple[HoldingRecord, ...] | None = None
    operations: tuple[dict[str, object], ...] | None = None
    operationCount: int | None = None

    def values(self) -> dict[str, object]:
        result = asdict(self)
        count = result.pop("operationCount")
        for name in ("mol", "group", "holdings", "operations"):
            if result[name] is None:
                result.pop(name)
        if self.holdings is not None:
            result["holdings"] = [
                {
                    key: value
                    for key, value in asdict(holding).items()
                    if key != "mol" or value is not None
                }
                for holding in self.holdings
            ]
        if count is not None:
            result["_count"] = {"operations": count}
        return result

    def snapshot(self) -> dict[str, object]:
        return {
            key: getattr(self, key)
            for key in (
                "id",
                "inventoryNumber",
                "name",
                "quantity",
                "unitPrice",
                "totalCost",
                "status",
                "isArchived",
            )
        }


@dataclass(frozen=True, slots=True)
class InventoryRecord:
    id: str
    name: str
    status: str
    molId: str
    createdById: str
    createdAt: datetime
    completedAt: datetime | None
    mol: dict[str, object]
    createdBy: dict[str, object]
    entries: tuple[InventoryEntry, ...] = ()


@dataclass(frozen=True, slots=True)
class InventoryEntry:
    id: str
    inventoryId: str
    assetId: str | None
    inventoryNumber: str
    assetName: str
    unitOfMeasure: str
    expectedQuantity: Decimal
    foundQuantity: Decimal | None
    note: str | None
    scannedById: str | None
    scannedAt: datetime | None
    createdAt: datetime
    updatedAt: datetime
    scannedBy: dict[str, object] | None = None


@dataclass(frozen=True, slots=True)
class MaintenanceRecord:
    id: str
    assetId: str
    type: str
    status: str
    title: str
    description: str | None
    scheduledDate: datetime
    startedAt: datetime | None
    completedAt: datetime | None
    nextDueDate: datetime | None
    provider: str | None
    cost: Decimal
    result: str | None
    assetStatusBefore: str | None
    createdAt: datetime
    updatedAt: datetime


@dataclass(frozen=True, slots=True)
class AssetPage:
    assets: tuple[AssetRecord, ...]
    total: int


@dataclass(frozen=True, slots=True)
class SavedViewRecord:
    id: str
    name: str
    filters: dict[str, str] = field(default_factory=dict)


class AssetRepository(Protocol):
    async def serializable(self) -> None: ...
    async def get(
        self, asset_id: str, *, lock: bool = False, relations: bool = False, detail: bool = False
    ) -> AssetRecord | None: ...
    async def target(self, asset_id: str) -> dict[str, object] | None: ...
    async def list(
        self, filters: dict[str, object], access: AccessContext, permission: str = "assets.read"
    ) -> AssetPage: ...
    async def create(self, values: dict[str, object]) -> AssetRecord: ...
    async def update(self, asset_id: str, values: dict[str, object]) -> AssetRecord: ...
    async def holding(self, asset_id: str, mol_id: str) -> HoldingRecord | None: ...
    async def holdings(
        self, asset_id: str, *, relations: bool = False
    ) -> tuple[HoldingRecord, ...]: ...
    async def set_holding(self, asset_id: str, mol_id: str, quantity: Decimal) -> None: ...
    async def operation(self, values: dict[str, object]) -> str: ...
    async def operations(
        self, filters: dict[str, object], access: AccessContext
    ) -> tuple[builtins.list[dict[str, object]], int]: ...
    async def export_assets(
        self, archived: bool | None, access: AccessContext
    ) -> tuple[AssetRecord, ...]: ...
    async def export_operations(
        self, access: AccessContext
    ) -> builtins.list[dict[str, object]]: ...
    async def visible_group_ids(self, access: AccessContext) -> set[str]: ...
    async def existing_numbers(self, numbers: builtins.list[str]) -> set[str]: ...
    async def inventory(
        self, inventory_id: str, *, lock: bool = False
    ) -> InventoryRecord | None: ...
    async def inventories(
        self, access: AccessContext, page: int, size: int
    ) -> tuple[builtins.list[dict[str, object]], int]: ...
    async def inventory_assets(
        self, mol_id: str, access: AccessContext
    ) -> tuple[AssetRecord, ...]: ...
    async def create_inventory(
        self, name: str, mol_id: str, actor_id: str, entries: tuple[AssetRecord, ...]
    ) -> InventoryRecord: ...
    async def update_entry(self, entry_id: str, values: dict[str, object]) -> InventoryEntry: ...
    async def complete_inventory(self, inventory_id: str, at: datetime) -> InventoryRecord: ...
    async def resolve(
        self, number: str, access: AccessContext
    ) -> builtins.list[dict[str, object]]: ...
    async def maintenance(self, asset_id: str) -> tuple[MaintenanceRecord, ...]: ...
    async def create_maintenance(self, values: dict[str, object]) -> MaintenanceRecord: ...
    async def update_maintenance(
        self, maintenance_id: str, values: dict[str, object]
    ) -> MaintenanceRecord: ...
    async def views(self, user_id: str) -> tuple[SavedViewRecord, ...]: ...
    async def create_view(
        self, user_id: str, name: str, filters: dict[str, str]
    ) -> SavedViewRecord: ...
    async def delete_view(self, user_id: str, view_id: str) -> bool: ...
    async def mol_options(
        self, allowed: tuple[str, ...] | None, *, active: bool = False
    ) -> builtins.list[dict[str, object]]: ...
