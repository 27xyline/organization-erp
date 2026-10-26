"""Сохранение основных средств через SQLAlchemy. Результаты отделены от сессии; \
фиксация транзакции не выполняется."""

from __future__ import annotations

import builtins
from collections.abc import Callable
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domain.auth.rules import AccessContext
from app.domain.ports.assets import (
    AssetPage,
    AssetRecord,
    HoldingRecord,
    InventoryEntry,
    InventoryRecord,
    MaintenanceRecord,
    SavedViewRecord,
)
from app.models.assets import (
    Asset,
    AssetHolding,
    AssetInventory,
    AssetInventoryEntry,
    AssetMaintenance,
    Operation,
)
from app.models.catalogs import Mol
from app.models.departments import Department
from app.models.reporting import AssetSavedView
from app.repositories.departments import _flush
from app.repositories.employees import columns


def scalar(row: Any) -> dict[str, Any]:
    return columns(row)


def visibility(access: AccessContext, permission: str) -> Any:
    departments = access.allowed_department_ids(permission)
    projects = access.allowed_project_ids(permission)
    if departments is None:
        return Asset.molId != ""
    mol_ids = select(Mol.id).where(Mol.departmentId.in_(departments))
    return or_(
        Asset.molId.in_(mol_ids),
        Asset.id.in_(
            select(AssetHolding.assetId).where(
                AssetHolding.molId.in_(mol_ids), AssetHolding.quantity > 0
            )
        ),
        Asset.projectId.is_not(None) if projects is None else Asset.projectId.in_(projects),
    )


class SqlAlchemyAssetRepository:
    def __init__(self, session: Callable[[], AsyncSession]) -> None:
        self._session = session

    async def serializable(self) -> None:
        await self._session().execute(text("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE"))

    async def _records(
        self, rows: builtins.list[Asset], *, relations: bool = False, counts: bool = False
    ) -> tuple[AssetRecord, ...]:
        holdings: dict[str, builtins.list[HoldingRecord]] = {}
        operation_counts: dict[str, int] = {}
        if rows and relations:
            records = (
                await self._session().scalars(
                    select(AssetHolding)
                    .where(
                        AssetHolding.assetId.in_([row.id for row in rows]),
                        AssetHolding.quantity > 0,
                    )
                    .options(selectinload(AssetHolding.mol))
                    .join(AssetHolding.mol)
                    .order_by(Mol.code)
                )
            ).all()
            for row in records:
                holdings.setdefault(row.assetId, []).append(
                    HoldingRecord(**scalar(row), mol=scalar(row.mol))
                )
        if rows and counts:
            operation_counts = dict(
                (
                    await self._session().execute(
                        select(Operation.assetId, func.count())
                        .where(Operation.assetId.in_([row.id for row in rows]))
                        .group_by(Operation.assetId)
                    )
                ).all()
            )
        return tuple(
            AssetRecord(
                **scalar(row),
                mol=scalar(row.mol) if relations else None,
                group=scalar(row.group) if relations else None,
                holdings=tuple(holdings.get(row.id, ())) if relations else None,
                operationCount=operation_counts.get(row.id, 0) if counts else None,
            )
            for row in rows
        )

    async def get(
        self, asset_id: str, *, lock: bool = False, relations: bool = False, detail: bool = False
    ) -> AssetRecord | None:
        query = select(Asset).where(Asset.id == asset_id)
        if lock:
            query = query.with_for_update()
        if relations:
            query = query.options(selectinload(Asset.mol), selectinload(Asset.group))
        row = await self._session().scalar(query.execution_options(populate_existing=True))
        if row is None:
            return None
        record = (await self._records([row], relations=relations))[0]
        if detail:
            from dataclasses import replace

            operations = await self._session().scalars(
                select(Operation)
                .where(Operation.assetId == asset_id)
                .options(selectinload(Operation.fromMol), selectinload(Operation.toMol))
                .order_by(Operation.date.desc())
            )
            record = replace(
                record,
                operations=tuple(
                    {
                        **scalar(operation),
                        "fromMol": scalar(operation.fromMol) if operation.fromMol else None,
                        "toMol": scalar(operation.toMol) if operation.toMol else None,
                    }
                    for operation in operations
                ),
            )
        return record

    async def target(self, asset_id: str) -> dict[str, object] | None:
        row = await self.get(asset_id)
        if row is None:
            return None
        departments = (
            await self._session().scalars(
                select(Mol.departmentId).where(
                    or_(
                        Mol.id == row.molId,
                        Mol.id.in_(
                            select(AssetHolding.molId).where(
                                AssetHolding.assetId == asset_id, AssetHolding.quantity > 0
                            )
                        ),
                    )
                )
            )
        ).all()
        return {"departmentIds": tuple(set(departments)), "projectId": row.projectId}

    async def list(
        self, filters: dict[str, object], access: AccessContext, permission: str = "assets.read"
    ) -> AssetPage:
        clauses = [
            visibility(access, permission),
            Asset.isArchived == filters.get("archived", False),
        ]
        for field in ("groupId", "status", "accountingForm"):
            if filters.get(field):
                clauses.append(getattr(Asset, field) == filters[field])
        if filters.get("molId"):
            clauses.append(
                Asset.id.in_(
                    select(AssetHolding.assetId).where(
                        AssetHolding.molId == filters["molId"], AssetHolding.quantity > 0
                    )
                )
            )
        if filters.get("search"):
            search = (
                "%"
                + str(filters["search"])
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_")
                + "%"
            )
            clauses.append(
                or_(
                    *(
                        getattr(Asset, field).ilike(search)
                        for field in ("name", "inventoryNumber", "documentDetails")
                    )
                )
            )
        if filters.get("dateFrom"):
            clauses.append(Asset.recordingDate >= datetime.fromisoformat(str(filters["dateFrom"])))
        if filters.get("dateTo"):
            clauses.append(
                Asset.recordingDate
                <= datetime.fromisoformat(str(filters["dateTo"]) + "T23:59:59.999")
            )
        total = (
            await self._session().scalar(select(func.count()).select_from(Asset).where(*clauses))
            or 0
        )
        size = int(str(filters.get("pageSize", 25)))
        page = int(str(filters.get("page", 1)))
        rows = list(
            (
                await self._session().scalars(
                    select(Asset)
                    .where(*clauses)
                    .options(selectinload(Asset.mol), selectinload(Asset.group))
                    .order_by(Asset.orderNumber)
                    .offset((page - 1) * size)
                    .limit(size)
                )
            ).all()
        )
        return AssetPage(await self._records(rows, relations=True, counts=True), total)

    async def create(self, values: dict[str, object]) -> AssetRecord:
        row = Asset(**values)
        self._session().add(row)
        await _flush(self._session())
        await self._session().refresh(row)
        return AssetRecord(**scalar(row))

    async def update(self, asset_id: str, values: dict[str, object]) -> AssetRecord:
        row = await self._session().get(Asset, asset_id)
        assert row is not None
        for key, value in values.items():
            setattr(row, key, value)
        await _flush(self._session())
        await self._session().refresh(row)
        return AssetRecord(**scalar(row))

    async def holding(self, asset_id: str, mol_id: str) -> HoldingRecord | None:
        row = await self._session().scalar(
            select(AssetHolding)
            .where(AssetHolding.assetId == asset_id, AssetHolding.molId == mol_id)
            .execution_options(populate_existing=True)
        )
        return HoldingRecord(**scalar(row)) if row else None

    async def holdings(
        self, asset_id: str, *, relations: bool = False
    ) -> tuple[HoldingRecord, ...]:
        query = select(AssetHolding).where(AssetHolding.assetId == asset_id)
        if relations:
            query = query.options(selectinload(AssetHolding.mol))
        return tuple(
            HoldingRecord(**scalar(row), mol=scalar(row.mol) if relations else None)
            for row in (await self._session().scalars(query)).all()
        )

    async def set_holding(self, asset_id: str, mol_id: str, quantity: Decimal) -> None:
        row = await self._session().scalar(
            select(AssetHolding).where(
                AssetHolding.assetId == asset_id, AssetHolding.molId == mol_id
            )
        )
        if quantity == 0:
            if row:
                await self._session().delete(row)
        elif row:
            row.quantity = quantity
        else:
            self._session().add(AssetHolding(assetId=asset_id, molId=mol_id, quantity=quantity))
        await _flush(self._session())

    async def operation(self, values: dict[str, object]) -> str:
        row = Operation(**values)
        self._session().add(row)
        await _flush(self._session())
        return row.id

    async def operations(
        self, filters: dict[str, object], access: AccessContext
    ) -> tuple[builtins.list[dict[str, object]], int]:
        clauses = [
            Operation.assetId.in_(select(Asset.id).where(visibility(access, "operations.read")))
        ]
        for key in ("assetId", "type"):
            if filters.get(key):
                clauses.append(getattr(Operation, key) == filters[key])
        total = (
            await self._session().scalar(
                select(func.count()).select_from(Operation).where(*clauses)
            )
            or 0
        )
        size, page = int(str(filters.get("pageSize", 25))), int(str(filters.get("page", 1)))
        rows = (
            await self._session().scalars(
                select(Operation)
                .where(*clauses)
                .options(
                    selectinload(Operation.asset).selectinload(Asset.group),
                    selectinload(Operation.fromMol),
                    selectinload(Operation.toMol),
                )
                .order_by(Operation.date.desc(), Operation.createdAt.desc())
                .offset((page - 1) * size)
                .limit(size)
            )
        ).all()
        return [
            {
                **scalar(row),
                "asset": {**scalar(row.asset), "group": scalar(row.asset.group)},
                "fromMol": scalar(row.fromMol) if row.fromMol else None,
                "toMol": scalar(row.toMol) if row.toMol else None,
            }
            for row in rows
        ], total

    async def export_assets(
        self, archived: bool | None, access: AccessContext
    ) -> tuple[AssetRecord, ...]:
        query = select(Asset).where(visibility(access, "assets.export"))
        if archived is not None:
            query = query.where(Asset.isArchived == archived)
        rows = builtins.list(
            (
                await self._session().scalars(
                    query.options(selectinload(Asset.mol), selectinload(Asset.group)).order_by(
                        Asset.orderNumber
                    )
                )
            ).all()
        )
        return await self._records(rows, relations=True)

    async def export_operations(self, access: AccessContext) -> builtins.list[dict[str, object]]:
        rows = (
            await self._session().scalars(
                select(Operation)
                .where(
                    Operation.assetId.in_(
                        select(Asset.id).where(visibility(access, "assets.export"))
                    )
                )
                .options(
                    selectinload(Operation.asset).selectinload(Asset.group),
                    selectinload(Operation.fromMol),
                    selectinload(Operation.toMol),
                )
                .order_by(Operation.date.desc())
            )
        ).all()
        return [
            {
                **scalar(row),
                "asset": {**scalar(row.asset), "group": scalar(row.asset.group)},
                "fromMol": scalar(row.fromMol) if row.fromMol else None,
                "toMol": scalar(row.toMol) if row.toMol else None,
            }
            for row in rows
        ]

    async def visible_group_ids(self, access: AccessContext) -> set[str]:
        return set(
            (
                await self._session().scalars(
                    select(Asset.groupId).where(visibility(access, "assets.read")).distinct()
                )
            ).all()
        )

    async def existing_numbers(self, numbers: builtins.list[str]) -> set[str]:
        return set(
            (
                await self._session().scalars(
                    select(Asset.inventoryNumber).where(Asset.inventoryNumber.in_(numbers))
                )
            ).all()
        )

    async def inventory(self, inventory_id: str, *, lock: bool = False) -> InventoryRecord | None:
        query = select(AssetInventory).where(AssetInventory.id == inventory_id)
        if lock:
            query = query.with_for_update()
        row = await self._session().scalar(
            query.options(
                selectinload(AssetInventory.mol), selectinload(AssetInventory.createdBy)
            ).execution_options(populate_existing=True)
        )
        if not row:
            return None
        entries = tuple(
            InventoryEntry(
                **scalar(entry),
                scannedBy={"id": entry.scannedBy.id, "name": entry.scannedBy.name}
                if entry.scannedBy
                else None,
            )
            for entry in (
                await self._session().scalars(
                    select(AssetInventoryEntry)
                    .where(AssetInventoryEntry.inventoryId == inventory_id)
                    .options(selectinload(AssetInventoryEntry.scannedBy))
                    .order_by(AssetInventoryEntry.inventoryNumber, AssetInventoryEntry.id)
                    .limit(5001)
                )
            ).all()
        )
        return InventoryRecord(
            **scalar(row),
            mol=scalar(row.mol),
            createdBy={"id": row.createdBy.id, "name": row.createdBy.name},
            entries=entries,
        )

    async def inventories(
        self, access: AccessContext, page: int, size: int
    ) -> tuple[builtins.list[dict[str, object]], int]:
        ids = access.allowed_department_ids("assets.inventory.manage")
        mol_query = (
            select(Mol.id)
            .join(Department, Department.id == Mol.departmentId)
            .where(Department.isActive.is_(True))
        )
        if ids is not None:
            mol_query = mol_query.where(Mol.departmentId.in_(ids))
        where = AssetInventory.molId.in_(mol_query)
        total = (
            await self._session().scalar(
                select(func.count()).select_from(AssetInventory).where(where)
            )
            or 0
        )
        rows = (
            await self._session().scalars(
                select(AssetInventory)
                .where(where)
                .options(selectinload(AssetInventory.mol), selectinload(AssetInventory.createdBy))
                .order_by(AssetInventory.createdAt.desc(), AssetInventory.id.desc())
                .offset((page - 1) * size)
                .limit(size)
            )
        ).all()
        counts = (
            dict(
                (
                    await self._session().execute(
                        select(AssetInventoryEntry.inventoryId, func.count())
                        .where(AssetInventoryEntry.inventoryId.in_([row.id for row in rows]))
                        .group_by(AssetInventoryEntry.inventoryId)
                    )
                ).all()
            )
            if rows
            else {}
        )
        return [
            {
                **scalar(row),
                "mol": {
                    key: getattr(row.mol, key)
                    for key in ("id", "code", "fullName", "storageLocation", "department")
                },
                "createdBy": {"id": row.createdBy.id, "name": row.createdBy.name},
                "_count": {"entries": counts.get(row.id, 0)},
            }
            for row in rows
        ], total

    async def inventory_assets(self, mol_id: str, access: AccessContext) -> tuple[AssetRecord, ...]:
        rows = list(
            (
                await self._session().scalars(
                    select(Asset)
                    .where(
                        Asset.isArchived.is_(False),
                        visibility(access, "assets.read"),
                        Asset.id.in_(
                            select(AssetHolding.assetId).where(
                                AssetHolding.molId == mol_id, AssetHolding.quantity > 0
                            )
                        ),
                    )
                    .options(selectinload(Asset.mol), selectinload(Asset.group))
                    .order_by(Asset.inventoryNumber, Asset.id)
                    .limit(5001)
                )
            ).all()
        )
        return await self._records(rows, relations=True)

    async def create_inventory(
        self, name: str, mol_id: str, actor_id: str, entries: tuple[AssetRecord, ...]
    ) -> InventoryRecord:
        row = AssetInventory(name=name, molId=mol_id, createdById=actor_id, status="IN_PROGRESS")
        self._session().add(row)
        await _flush(self._session())
        for asset in entries:
            quantity = next(
                holding.quantity for holding in asset.holdings or () if holding.molId == mol_id
            )
            self._session().add(
                AssetInventoryEntry(
                    inventoryId=row.id,
                    assetId=asset.id,
                    inventoryNumber=asset.inventoryNumber,
                    assetName=asset.name,
                    unitOfMeasure=asset.unitOfMeasure,
                    expectedQuantity=quantity,
                )
            )
        await _flush(self._session())
        result = await self.inventory(row.id)
        assert result is not None
        return result

    async def update_entry(self, entry_id: str, values: dict[str, object]) -> InventoryEntry:
        row = await self._session().get(AssetInventoryEntry, entry_id)
        assert row is not None
        for key, value in values.items():
            setattr(row, key, value)
        await _flush(self._session())
        await self._session().refresh(row)
        return InventoryEntry(**scalar(row))

    async def complete_inventory(self, inventory_id: str, at: datetime) -> InventoryRecord:
        row = await self._session().get(AssetInventory, inventory_id)
        assert row is not None
        row.status = "COMPLETED"  # type: ignore[assignment]
        row.completedAt = at
        await _flush(self._session())
        result = await self.inventory(inventory_id)
        assert result is not None
        return result

    async def resolve(self, number: str, access: AccessContext) -> builtins.list[dict[str, object]]:
        rows = (
            await self._session().scalars(
                select(AssetInventoryEntry)
                .join(AssetInventory)
                .where(
                    AssetInventoryEntry.inventoryNumber == number,
                    AssetInventory.status == "IN_PROGRESS",
                )
                .options(
                    selectinload(AssetInventoryEntry.inventory).selectinload(AssetInventory.mol)
                )
                .order_by(AssetInventory.createdAt.desc())
                .limit(100)
            )
        ).all()
        return [
            {
                **scalar(row),
                "inventory": {
                    "id": row.inventory.id,
                    "name": row.inventory.name,
                    "mol": {
                        key: getattr(row.inventory.mol, key)
                        for key in ("id", "code", "fullName", "departmentId")
                    },
                },
            }
            for row in rows
            if access.allows(
                "assets.inventory.manage", {"departmentId": row.inventory.mol.departmentId}
            )
        ]

    async def maintenance(self, asset_id: str) -> tuple[MaintenanceRecord, ...]:
        return tuple(
            MaintenanceRecord(**scalar(row))
            for row in (
                await self._session().scalars(
                    select(AssetMaintenance)
                    .where(AssetMaintenance.assetId == asset_id)
                    .order_by(
                        AssetMaintenance.scheduledDate.desc(), AssetMaintenance.createdAt.desc()
                    )
                )
            ).all()
        )

    async def create_maintenance(self, values: dict[str, object]) -> MaintenanceRecord:
        row = AssetMaintenance(**values)
        self._session().add(row)
        await _flush(self._session())
        await self._session().refresh(row)
        return MaintenanceRecord(**scalar(row))

    async def update_maintenance(
        self, maintenance_id: str, values: dict[str, object]
    ) -> MaintenanceRecord:
        row = await self._session().get(AssetMaintenance, maintenance_id)
        assert row is not None
        for key, value in values.items():
            setattr(row, key, value)
        await _flush(self._session())
        await self._session().refresh(row)
        return MaintenanceRecord(**scalar(row))

    async def views(self, user_id: str) -> tuple[SavedViewRecord, ...]:
        return tuple(
            SavedViewRecord(row.id, row.name, row.filters)
            for row in (
                await self._session().scalars(
                    select(AssetSavedView)
                    .where(AssetSavedView.userId == user_id)
                    .order_by(AssetSavedView.updatedAt.desc(), AssetSavedView.name)
                )
            ).all()
        )

    async def create_view(
        self, user_id: str, name: str, filters: dict[str, str]
    ) -> SavedViewRecord:
        row = AssetSavedView(userId=user_id, name=name, filters=filters)
        self._session().add(row)
        await _flush(self._session())
        return SavedViewRecord(row.id, row.name, row.filters)

    async def delete_view(self, user_id: str, view_id: str) -> bool:
        result = await self._session().execute(
            delete(AssetSavedView).where(
                AssetSavedView.id == view_id, AssetSavedView.userId == user_id
            )
        )
        return bool(getattr(result, "rowcount", 0))

    async def mol_options(
        self, allowed: tuple[str, ...] | None, *, active: bool = False
    ) -> builtins.list[dict[str, object]]:
        query = select(Mol)
        if allowed is not None:
            query = query.where(Mol.departmentId.in_(allowed))
        if active:
            query = query.join(Department, Department.id == Mol.departmentId).where(
                Department.isActive.is_(True)
            )
        return [
            scalar(row)
            for row in (
                await self._session().scalars(query.order_by(Mol.fullName if active else Mol.code))
            ).all()
        ]
