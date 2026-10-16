"""Asset lifecycle use cases, authorization and one explicit transaction decision."""

from __future__ import annotations

import builtins
from collections.abc import Awaitable, Callable
from dataclasses import asdict, replace
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import TypeVar, cast

from app.core.context import Actor, RequestContext
from app.domain.assets.lifecycle import ensure_transfer_destination, remaining_quantity
from app.domain.errors import DomainError, PersistenceConflict, RetryableTransactionError
from app.domain.ports.assets import AssetPage, AssetRecord
from app.domain.ports.audit import AuditRecord, JsonValue
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.services.catalogs import _authorize, _check_actor
from app.services.dto.assets import AssetCommand, AssetQuery, MovementCommand, OperationQuery

T = TypeVar("T")


def asset_json(value: object) -> JsonValue:
    if isinstance(value, Decimal):
        result = format(value, "f")
        return result.rstrip("0").rstrip(".") if "." in result else result
    if isinstance(value, datetime):
        return value.isoformat(timespec="milliseconds") + "Z"
    if isinstance(value, date):
        return value.isoformat() + "T00:00:00.000Z"
    if isinstance(value, dict):
        return {str(key): asset_json(item) for key, item in value.items()}
    if isinstance(value, (builtins.list, tuple)):
        return [asset_json(item) for item in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    raise TypeError("Unsupported asset JSON value")


def asset_error(code: str) -> DomainError:
    message, status = {
        "ASSET_NOT_FOUND": ("Объект имущества не найден", 404),
        "ASSET_ARCHIVED": ("Архивный объект нельзя изменить", 409),
        "MOL_NOT_FOUND": ("МОЛ не найден", 404),
        "HOLDING_NOT_FOUND": ("У выбранного МОЛ нет остатка этого объекта", 404),
        "INSUFFICIENT_QUANTITY": ("Недостаточный остаток", 422),
        "QUANTITY_OPERATION_REQUIRED": (
            "Количество изменяется только операцией поступления или списания",
            409,
        ),
        "MOL_TRANSFER_REQUIRED": ("МОЛ изменяется только через операцию передачи", 409),
        "FULLY_DISPOSED_RESTORE_FORBIDDEN": (
            "Полностью списанный объект нельзя восстановить без нового поступления",
            409,
        ),
        "INVENTORY_NUMBER_EXISTS": ("Инвентарный номер уже используется", 409),
    }[code]
    return DomainError(code, message, status)


async def audit(
    uow: UnitOfWork,
    context: RequestContext,
    action: str,
    entity: str,
    entity_id: str,
    details: dict[str, object],
) -> None:
    assert context.actor is not None
    await uow.audit.append(
        AuditRecord(
            action,
            entity,
            entity_id,
            context.actor.actor_id,
            cast(dict[str, JsonValue], asset_json(details)),
            context.request_id,
        )
    )


async def check_asset(
    uow: UnitOfWork,
    asset_id: str,
    actor: Actor,
    permission: str,
    *,
    lock: bool = False,
    missing_hidden: bool = False,
) -> AssetRecord:
    target = await uow.assets.target(asset_id)
    if target is None:
        raise asset_error("ASSET_NOT_FOUND")
    if missing_hidden and actor.access and not actor.access.allows(permission, target):
        raise asset_error("ASSET_NOT_FOUND")
    _authorize(
        actor,
        permission,
        {"departmentIds": target["departmentIds"]}
        if permission in {"assets.update", "assets.archive", "assets.restore"}
        else target,
    )
    record = await uow.assets.get(asset_id, lock=lock)
    assert record is not None
    return record


async def check_mols(
    uow: UnitOfWork, actor: Actor, permission: str, mol_ids: tuple[str, ...]
) -> None:
    departments = []
    for mol_id in mol_ids:
        department = await uow.mols.department_target(mol_id)
        if department:
            departments.append(department)
    if departments:
        _authorize(actor, permission, {"departmentIds": departments})


async def create_asset_in_uow(
    command: AssetCommand, context: RequestContext, uow: UnitOfWork
) -> AssetRecord:
    """Compose asset + holding + receipt + audit; caller owns authorization and commit."""
    values = command.values()
    values["totalCost"] = command.unitPrice * command.quantity
    asset = await uow.assets.create(values)
    await uow.assets.set_holding(asset.id, command.molId, command.quantity)
    await uow.assets.operation(
        {
            "type": "RECEIPT",
            "assetId": asset.id,
            "toMolId": command.molId,
            "quantity": command.quantity,
            "unitPrice": command.unitPrice,
            "totalCost": command.unitPrice * command.quantity,
            "date": command.recordingDate,
            "reason": "Первоначальное поступление",
            "documentType": command.documentType,
            "documentDetails": command.documentDetails,
            "documentFiles": command.documentFiles,
        }
    )
    await audit(
        uow, context, "ASSET_CREATE", "Asset", asset.id, {"before": None, "after": asset.snapshot()}
    )
    return asset


class AssetService:
    def __init__(self, factory: UnitOfWorkFactory[UnitOfWork]) -> None:
        self.factory = factory

    async def mutate(
        self,
        context: RequestContext,
        permission: str,
        work: Callable[[UnitOfWork, Actor], Awaitable[T]],
        *,
        serializable: bool = True,
    ) -> T:
        actor = context.actor
        assert actor is not None
        _authorize(actor, permission)
        for attempt in range(3):
            try:
                async with self.factory() as uow:
                    if serializable:
                        await uow.assets.serializable()
                    await _check_actor(uow, actor)
                    result = await work(uow, actor)
                    await uow.commit()
                    return result
            except PersistenceConflict as error:
                if error.constraint == "assets_inventoryNumber_key":
                    raise asset_error("INVENTORY_NUMBER_EXISTS") from error
                raise
            except RetryableTransactionError:
                if not serializable or attempt == 2:
                    raise
        raise AssertionError("bounded retry exhausted")

    async def list(
        self, query: AssetQuery, actor: Actor, *, permission: str = "assets.read"
    ) -> AssetPage:
        _authorize(actor, permission)
        assert actor.access is not None
        async with self.factory() as uow:
            return await uow.assets.list(asdict(query), actor.access, permission)

    async def get(self, asset_id: str, actor: Actor, *, hidden: bool = False) -> AssetRecord:
        _authorize(actor, "assets.read")
        async with self.factory() as uow:
            await check_asset(uow, asset_id, actor, "assets.read", missing_hidden=hidden)
            result = await uow.assets.get(asset_id, relations=True, detail=True)
            assert result is not None
            return result

    async def catalogs(self, actor: Actor) -> dict[str, object]:
        _authorize(actor, "assets.read")
        assert actor.access is not None
        async with self.factory() as uow:
            mols = await uow.assets.mol_options(actor.access.allowed_department_ids("mols.read"))
            groups = await uow.groups.list()
            if not actor.access.has("assetGroups.read"):
                # Match legacy catalogs: groups must have a visible asset.
                visible = await uow.assets.visible_group_ids(actor.access)
                groups = [group for group in groups if group.id in visible]
            return {"mols": mols, "groups": [group.as_dict() for group in groups]}

    async def operations(
        self, query: OperationQuery, actor: Actor
    ) -> tuple[builtins.list[dict[str, object]], int]:
        _authorize(actor, "operations.read")
        assert actor.access is not None
        async with self.factory() as uow:
            return await uow.assets.operations(asdict(query), actor.access)

    async def create(self, command: AssetCommand, context: RequestContext) -> AssetRecord:
        async def work(uow: UnitOfWork, actor: Actor) -> AssetRecord:
            await check_mols(uow, actor, "assets.create", (command.molId,))
            asset = await create_asset_in_uow(command, context, uow)
            result = await uow.assets.get(asset.id, relations=True)
            assert result is not None
            return result

        return await self.mutate(context, "assets.create", work)

    async def create_many(self, commands: tuple[AssetCommand, ...], context: RequestContext) -> int:
        async def work(uow: UnitOfWork, actor: Actor) -> int:
            for command in commands:
                await check_mols(uow, actor, "assets.create", (command.molId,))
                await create_asset_in_uow(command, context, uow)
            return len(commands)

        return await self.mutate(context, "assets.create", work)

    async def update(
        self, asset_id: str, command: AssetCommand, context: RequestContext
    ) -> AssetRecord:
        async def work(uow: UnitOfWork, actor: Actor) -> AssetRecord:
            before = await check_asset(uow, asset_id, actor, "assets.update")
            # Match project graph/scope writers: actor -> ordered projects -> asset.
            for project_id in sorted(
                {value for value in (before.projectId, command.projectId) if value}
            ):
                await uow.projects.lock(project_id)
            # SERIALIZABLE rechecks a changed pre-read on acquisition via 40001/retry.
            current = await check_asset(uow, asset_id, actor, "assets.update", lock=True)
            if current.quantity != command.quantity:
                raise asset_error("QUANTITY_OPERATION_REQUIRED")
            if current.molId != command.molId:
                raise asset_error("MOL_TRANSFER_REQUIRED")
            values = command.values()
            values["totalCost"] = current.quantity * command.unitPrice
            updated = await uow.assets.update(asset_id, values)
            await uow.assets.operation(
                {
                    "type": "STATUS_CHANGE",
                    "assetId": asset_id,
                    "quantity": updated.quantity,
                    "unitPrice": updated.unitPrice,
                    "totalCost": updated.totalCost,
                    "date": datetime.now(UTC).replace(tzinfo=None),
                    "reason": f"Редактирование объекта: {command.editReason}",
                    "documentType": "Редактирование",
                    "documentDetails": command.editReason or "",
                    "oldStatus": current.status,
                    "newStatus": updated.status,
                }
            )
            await audit(
                uow,
                context,
                "ASSET_UPDATE",
                "Asset",
                asset_id,
                {
                    "before": current.snapshot(),
                    "after": updated.snapshot(),
                    "reason": command.editReason,
                },
            )
            result = await uow.assets.get(asset_id, relations=True)
            assert result is not None
            return result

        return await self.mutate(context, "assets.update", work)

    async def transfer(
        self, asset_id: str, command: MovementCommand, context: RequestContext
    ) -> AssetRecord:
        async def work(uow: UnitOfWork, actor: Actor) -> AssetRecord:
            ensure_transfer_destination(command.fromMolId, command.toMolId)
            assert command.toMolId is not None
            await check_mols(uow, actor, "assets.transfer", (command.fromMolId, command.toMolId))
            asset = await uow.assets.get(asset_id, lock=True)
            if not asset:
                raise asset_error("ASSET_NOT_FOUND")
            if asset.isArchived:
                raise asset_error("ASSET_ARCHIVED")
            if await uow.mols.department_target(command.toMolId) is None:
                raise asset_error("MOL_NOT_FOUND")
            source = await uow.assets.holding(asset_id, command.fromMolId)
            if source is None:
                raise asset_error("HOLDING_NOT_FOUND")
            remaining = remaining_quantity(source.quantity, command.quantity)
            destination = await uow.assets.holding(asset_id, command.toMolId)
            await uow.assets.set_holding(asset_id, command.fromMolId, remaining)
            await uow.assets.set_holding(
                asset_id,
                command.toMolId,
                (destination.quantity if destination else Decimal(0)) + command.quantity,
            )
            if asset.molId == command.fromMolId and remaining == 0:
                await uow.assets.update(asset_id, {"molId": command.toMolId})
            operation_id = await self._movement(uow, asset, command, "TRANSFER")
            await audit(
                uow,
                context,
                "ASSET_TRANSFER",
                "Asset",
                asset_id,
                {
                    "operationId": operation_id,
                    "fromMolId": command.fromMolId,
                    "toMolId": command.toMolId,
                    "quantity": command.quantity,
                },
            )
            result = await uow.assets.get(asset_id, relations=True)
            assert result is not None
            return result

        return await self.mutate(context, "assets.transfer", work)

    async def dispose(
        self, asset_id: str, command: MovementCommand, context: RequestContext
    ) -> AssetRecord:
        async def work(uow: UnitOfWork, actor: Actor) -> AssetRecord:
            await check_mols(uow, actor, "assets.dispose", (command.fromMolId,))
            asset = await uow.assets.get(asset_id, lock=True)
            if not asset:
                raise asset_error("ASSET_NOT_FOUND")
            if asset.isArchived:
                raise asset_error("ASSET_ARCHIVED")
            source = await uow.assets.holding(asset_id, command.fromMolId)
            if source is None:
                raise asset_error("HOLDING_NOT_FOUND")
            source_remaining = remaining_quantity(source.quantity, command.quantity)
            remaining = remaining_quantity(asset.quantity, command.quantity)
            await uow.assets.set_holding(asset_id, command.fromMolId, source_remaining)
            status = "FULLY_DISPOSED" if remaining == 0 else "PARTIALLY_DISPOSED"
            updated = await uow.assets.update(
                asset_id,
                {
                    "quantity": remaining,
                    "totalCost": asset.unitPrice * remaining,
                    "status": status,
                    "isArchived": remaining == 0,
                },
            )
            if asset.molId == command.fromMolId and source_remaining == 0 and remaining != 0:
                holdings = await uow.assets.holdings(asset_id)
                if holdings:
                    await uow.assets.update(asset_id, {"molId": holdings[0].molId})
            operation_id = await self._movement(uow, asset, command, "DISPOSAL", status)
            await audit(
                uow,
                context,
                "ASSET_DISPOSAL",
                "Asset",
                asset_id,
                {
                    "operationId": operation_id,
                    "fromMolId": command.fromMolId,
                    "quantity": command.quantity,
                    "remaining": remaining,
                },
            )
            return replace(updated, holdings=await uow.assets.holdings(asset_id))

        return await self.mutate(context, "assets.dispose", work)

    async def _movement(
        self,
        uow: UnitOfWork,
        asset: AssetRecord,
        command: MovementCommand,
        kind: str,
        status: str | None = None,
    ) -> str:
        values: dict[str, object] = {
            "type": kind,
            "assetId": asset.id,
            "fromMolId": command.fromMolId,
            "toMolId": command.toMolId,
            "quantity": command.quantity,
            "unitPrice": asset.unitPrice,
            "totalCost": asset.unitPrice * command.quantity,
            "date": command.date,
            "reason": command.reason,
            "documentType": command.documentType,
            "documentDetails": command.documentDetails,
            "documentFiles": command.documentFiles,
        }
        if status:
            values.update(oldStatus=asset.status, newStatus=status)
        return await uow.assets.operation(values)

    async def archive(self, asset_id: str, reason: str, context: RequestContext) -> AssetRecord:
        async def work(uow: UnitOfWork, actor: Actor) -> AssetRecord:
            current = await check_asset(uow, asset_id, actor, "assets.archive", lock=True)
            if current.isArchived:
                return current
            result = await uow.assets.update(asset_id, {"isArchived": True})
            await uow.assets.operation(
                {
                    "type": "STATUS_CHANGE",
                    "assetId": asset_id,
                    "quantity": current.quantity,
                    "unitPrice": current.unitPrice,
                    "totalCost": current.totalCost,
                    "date": datetime.now(UTC).replace(tzinfo=None),
                    "reason": reason,
                    "documentType": "Архивирование",
                    "documentDetails": reason,
                    "oldStatus": current.status,
                    "newStatus": current.status,
                }
            )
            await audit(
                uow,
                context,
                "ASSET_ARCHIVE",
                "Asset",
                asset_id,
                {"before": current.snapshot(), "after": result.snapshot(), "reason": reason},
            )
            return result

        return await self.mutate(context, "assets.archive", work)

    async def restore(self, asset_id: str, context: RequestContext) -> AssetRecord:
        async def work(uow: UnitOfWork, actor: Actor) -> AssetRecord:
            current = await check_asset(uow, asset_id, actor, "assets.restore", lock=True)
            if current.status == "FULLY_DISPOSED":
                raise asset_error("FULLY_DISPOSED_RESTORE_FORBIDDEN")
            result = await uow.assets.update(asset_id, {"isArchived": False})
            await audit(
                uow,
                context,
                "ASSET_RESTORE",
                "Asset",
                asset_id,
                {"before": current.snapshot(), "after": result.snapshot()},
            )
            return result

        return await self.mutate(context, "assets.restore", work)
