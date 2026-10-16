"""Inventory snapshots and counts; completing a sheet never adjusts stock."""

from dataclasses import asdict
from datetime import UTC, datetime
from typing import Any

from app.core.context import Actor, RequestContext
from app.domain.assets.inventory import InventoryQuantity, summarize_inventory
from app.domain.errors import DomainError
from app.domain.ports.assets import InventoryEntry, InventoryRecord
from app.domain.ports.uow import UnitOfWork
from app.services.assets import AssetService, audit
from app.services.catalogs import _authorize
from app.services.dto.assets import CountCommand, InventoryCommand


def inventory_error(code: str) -> DomainError:
    message, status = {
        "MOL_NOT_FOUND": ("МОЛ не найден или недоступен", 404),
        "EMPTY_INVENTORY": ("В выбранном месте нет имущества для инвентаризации", 422),
        "INVENTORY_TOO_LARGE": (
            "Разделите проверку: в одной ведомости не более 5 000 позиций",
            422,
        ),
        "INVENTORY_NOT_FOUND": ("Инвентаризация не найдена", 404),
        "INVENTORY_COMPLETED": ("Инвентаризация уже завершена", 409),
        "ASSET_NOT_IN_INVENTORY": ("Позиция не входит в эту инвентаризацию", 404),
    }[code]
    return DomainError(code, message, status)


def inventory_values(
    record: InventoryRecord, *, full_mol: bool = True, count: bool = False
) -> dict[str, Any]:
    result = asdict(record)
    result.pop("entries")
    if not full_mol:
        result["mol"] = {
            key: record.mol[key]
            for key in ("id", "code", "fullName", "storageLocation", "departmentId", "department")
        }
    if count:
        result["_count"] = {"entries": len(record.entries)}
    return result


class InventoryService(AssetService):
    async def _inventory(
        self,
        uow: UnitOfWork,
        inventory_id: str,
        actor: Actor,
        *,
        lock: bool = False,
        mutable: bool = False,
    ) -> InventoryRecord:
        record = await uow.assets.inventory(inventory_id, lock=lock)
        if (
            record is None
            or actor.access is None
            or not actor.access.allows(
                "assets.inventory.manage", {"departmentId": record.mol["departmentId"]}
            )
        ):
            raise inventory_error("INVENTORY_NOT_FOUND")
        if mutable and record.status != "IN_PROGRESS":
            raise inventory_error("INVENTORY_COMPLETED")
        return record

    async def list_inventories(
        self, actor: Actor, page: int, size: int
    ) -> tuple[list[dict[str, object]], int]:
        _authorize(actor, "assets.inventory.manage")
        assert actor.access is not None
        async with self.factory() as uow:
            return await uow.assets.inventories(actor.access, page, size)

    async def options(self, actor: Actor) -> list[dict[str, object]]:
        _authorize(actor, "assets.inventory.manage")
        assert actor.access is not None
        async with self.factory() as uow:
            values = await uow.assets.mol_options(
                actor.access.allowed_department_ids("assets.inventory.manage"), active=True
            )
            return [
                {
                    key: row[key]
                    for key in (
                        "id",
                        "code",
                        "fullName",
                        "storageLocation",
                        "departmentId",
                        "department",
                    )
                }
                for row in values
                if actor.access.allows(
                    "assets.inventory.manage", {"departmentId": row["departmentId"]}
                )
            ]

    async def create_inventory(
        self, command: InventoryCommand, context: RequestContext
    ) -> dict[str, Any]:
        async def work(uow: UnitOfWork, actor: Actor) -> dict[str, Any]:
            assert actor.access is not None
            options = await uow.assets.mol_options(None, active=True)
            mol = next((row for row in options if row["id"] == command.molId), None)
            if mol is None or not actor.access.allows(
                "assets.inventory.manage", {"departmentId": mol["departmentId"]}
            ):
                raise inventory_error("MOL_NOT_FOUND")
            assets = await uow.assets.inventory_assets(command.molId, actor.access)
            if len(assets) > 5000:
                raise inventory_error("INVENTORY_TOO_LARGE")
            if not assets:
                raise inventory_error("EMPTY_INVENTORY")
            record = await uow.assets.create_inventory(
                command.name, command.molId, actor.actor_id, assets
            )
            await audit(
                uow,
                context,
                "ASSET_INVENTORY_CREATE",
                "AssetInventory",
                record.id,
                {"name": command.name, "molId": command.molId, "assetCount": len(assets)},
            )
            return inventory_values(record, count=True)

        return await self.mutate(context, "assets.inventory.manage", work, serializable=False)

    async def get_inventory(
        self,
        inventory_id: str,
        actor: Actor,
        page: int = 1,
        size: int = 50,
        search: str | None = None,
        *,
        act: bool = False,
    ) -> dict[str, Any]:
        _authorize(actor, "assets.inventory.manage")
        async with self.factory() as uow:
            record = await self._inventory(uow, inventory_id, actor)
            entries = tuple(
                entry
                for entry in record.entries
                if not search
                or search.lower() in entry.inventoryNumber.lower()
                or search.lower() in entry.assetName.lower()
            )
            selected = entries[(page - 1) * size : page * size]
            entry_values = [asdict(entry) for entry in selected]
            if act:
                for entry, values in zip(selected, entry_values, strict=True):
                    values["differenceQuantity"] = (
                        str(entry.foundQuantity - entry.expectedQuantity)
                        if entry.foundQuantity is not None
                        else None
                    )
            result = inventory_values(record, full_mol=False)
            result = {
                key: result[key]
                for key in ("id", "name", "status", "createdAt", "completedAt", "mol", "createdBy")
            }
            return {
                "inventory": result,
                "entries": entry_values,
                "summary": summarize_inventory(
                    tuple(
                        InventoryQuantity(entry.expectedQuantity, entry.foundQuantity)
                        for entry in record.entries
                    )
                ),
                "page": page,
                "pageSize": size,
                "total": len(entries),
                "totalPages": (len(entries) + size - 1) // size,
            }

    async def scan(
        self, inventory_id: str, command: CountCommand, context: RequestContext
    ) -> InventoryEntry:
        async def work(uow: UnitOfWork, actor: Actor) -> InventoryEntry:
            record = await self._inventory(uow, inventory_id, actor, lock=True, mutable=True)
            entry = next(
                (
                    entry
                    for entry in record.entries
                    if entry.inventoryNumber == command.inventoryNumber
                ),
                None,
            )
            if entry is None:
                raise inventory_error("ASSET_NOT_IN_INVENTORY")
            updated = await uow.assets.update_entry(
                entry.id,
                {
                    "foundQuantity": command.foundQuantity,
                    "note": command.note,
                    "scannedById": actor.actor_id,
                    "scannedAt": datetime.now(UTC).replace(tzinfo=None),
                },
            )
            await audit(
                uow,
                context,
                "ASSET_INVENTORY_SCAN",
                "AssetInventoryEntry",
                entry.id,
                {
                    "inventoryId": inventory_id,
                    "inventoryNumber": entry.inventoryNumber,
                    "expectedQuantity": entry.expectedQuantity,
                    "foundQuantity": command.foundQuantity,
                },
            )
            return updated

        return await self.mutate(context, "assets.inventory.manage", work, serializable=False)

    async def complete(self, inventory_id: str, context: RequestContext) -> dict[str, Any]:
        async def work(uow: UnitOfWork, actor: Actor) -> dict[str, Any]:
            record = await self._inventory(uow, inventory_id, actor, lock=True, mutable=True)
            if not record.entries:
                raise inventory_error("EMPTY_INVENTORY")
            at = datetime.now(UTC).replace(tzinfo=None)
            updated = await uow.assets.complete_inventory(inventory_id, at)
            await audit(
                uow,
                context,
                "ASSET_INVENTORY_COMPLETE",
                "AssetInventory",
                inventory_id,
                {"name": record.name, "entryCount": len(record.entries), "completedAt": at},
            )
            return inventory_values(updated)

        return await self.mutate(context, "assets.inventory.manage", work, serializable=False)

    async def resolve(self, number: str, actor: Actor) -> list[dict[str, object]]:
        _authorize(actor, "assets.inventory.manage")
        assert actor.access is not None
        async with self.factory() as uow:
            return await uow.assets.resolve(number, actor.access)
