"""Maintenance transitions with asset status and audit in the same transaction."""

from dataclasses import asdict
from datetime import UTC, datetime

from app.core.context import Actor, RequestContext
from app.domain.assets.maintenance import ensure_transition, restored_status
from app.domain.errors import DomainError
from app.domain.ports.assets import MaintenanceRecord
from app.domain.ports.uow import UnitOfWork
from app.services.assets import AssetService, audit, check_asset
from app.services.catalogs import _authorize
from app.services.dto.assets import MaintenanceCommand


class AssetLifecycleService(AssetService):
    async def list_maintenance(self, asset_id: str, actor: Actor) -> tuple[MaintenanceRecord, ...]:
        _authorize(actor, "assets.read")
        async with self.factory() as uow:
            await check_asset(uow, asset_id, actor, "assets.read")
            return await uow.assets.maintenance(asset_id)

    async def create_maintenance(
        self, asset_id: str, command: MaintenanceCommand, context: RequestContext
    ) -> MaintenanceRecord:
        async def work(uow: UnitOfWork, actor: Actor) -> MaintenanceRecord:
            asset = await check_asset(uow, asset_id, actor, "assets.update", lock=True)
            if asset.isArchived or asset.status == "FULLY_DISPOSED":
                raise DomainError(
                    "ASSET_UNAVAILABLE", "Архивный или списанный объект нельзя обслуживать", 409
                )
            record = await uow.assets.create_maintenance(
                {
                    "assetId": asset_id,
                    "type": command.type,
                    "title": command.title,
                    "description": command.description or None,
                    "scheduledDate": command.scheduledDate,
                    "nextDueDate": command.nextDueDate,
                    "provider": command.provider or None,
                    "cost": command.cost or 0,
                }
            )
            await audit(
                uow,
                context,
                "ASSET_MAINTENANCE_CREATE",
                "AssetMaintenance",
                record.id,
                {"assetId": asset_id, "type": record.type, "scheduledDate": record.scheduledDate},
            )
            return record

        return await self.mutate(context, "assets.update", work, serializable=False)

    async def update_maintenance(
        self,
        asset_id: str,
        maintenance_id: str,
        command: MaintenanceCommand,
        context: RequestContext,
    ) -> MaintenanceRecord:
        async def work(uow: UnitOfWork, actor: Actor) -> MaintenanceRecord:
            asset = await check_asset(uow, asset_id, actor, "assets.update", lock=True)
            current = next(
                (
                    item
                    for item in await uow.assets.maintenance(asset_id)
                    if item.id == maintenance_id
                ),
                None,
            )
            if current is None:
                raise DomainError("MAINTENANCE_NOT_FOUND", "Запись не найдена", 404)
            following = command.status or current.status
            ensure_transition(current.status, following)
            previous_asset_status = current.assetStatusBefore
            next_asset_status = None
            if (
                current.type == "REPAIR"
                and current.status != "IN_PROGRESS"
                and following == "IN_PROGRESS"
            ):
                previous_asset_status = asset.status
                next_asset_status = "UNDER_REPAIR"
            if (
                current.type == "REPAIR"
                and current.status == "IN_PROGRESS"
                and following in {"COMPLETED", "CANCELED"}
            ):
                next_asset_status = restored_status(current.assetStatusBefore)
            values = {
                key: value
                for key, value in asdict(command).items()
                if key in command.present and key not in {"type", "present"}
            }
            values.update(status=following, assetStatusBefore=previous_asset_status)
            for key in ("description", "provider", "result"):
                if key in values:
                    values[key] = values[key] or None
            if following == "IN_PROGRESS":
                values["startedAt"] = (
                    command.startedAt or current.startedAt or datetime.now(UTC).replace(tzinfo=None)
                )
            if following == "COMPLETED":
                values["completedAt"] = (
                    command.completedAt
                    or current.completedAt
                    or datetime.now(UTC).replace(tzinfo=None)
                )
            record = await uow.assets.update_maintenance(maintenance_id, values)
            if next_asset_status and next_asset_status != asset.status:
                await uow.assets.update(asset_id, {"status": next_asset_status})
                await uow.assets.operation(
                    {
                        "type": "STATUS_CHANGE",
                        "assetId": asset_id,
                        "quantity": asset.quantity,
                        "unitPrice": asset.unitPrice,
                        "totalCost": asset.totalCost,
                        "date": datetime.now(UTC).replace(tzinfo=None),
                        "reason": record.title,
                        "documentType": "Обслуживание имущества",
                        "documentDetails": record.result or record.description or record.title,
                        "oldStatus": asset.status,
                        "newStatus": next_asset_status,
                    }
                )
            await audit(
                uow,
                context,
                "ASSET_MAINTENANCE_UPDATE",
                "AssetMaintenance",
                maintenance_id,
                {
                    "assetId": asset_id,
                    "beforeStatus": current.status,
                    "afterStatus": record.status,
                    "cost": float(record.cost),
                },
            )
            return record

        return await self.mutate(context, "assets.update", work, serializable=False)
