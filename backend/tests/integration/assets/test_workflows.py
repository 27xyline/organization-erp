"""PostgreSQL invariants, independent connection races, rollback and scoped denial."""

import asyncio
from dataclasses import replace
from datetime import datetime
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.domain.auth.rules import AccessContext, ScopeGrant
from app.domain.errors import DomainError
from app.models.assets import Asset, AssetHolding, Operation
from app.models.users import AuditLog, User
from app.services.asset_lifecycle import AssetLifecycleService
from app.services.dto.assets import (
    AssetQuery,
    CountCommand,
    InventoryCommand,
    MaintenanceCommand,
    MovementCommand,
)
from app.services.inventory import InventoryService
from tests.audit_cleanup import clear_audit_logs_for_test_cleanup


def movement(mol, quantity, **values):
    return MovementCommand(
        mol, Decimal(quantity), datetime(2026, 10, 2), "Акт", "Основание", **values
    )


@pytest.mark.anyio
async def test_decimal_race_two_independent_sessions_cannot_overdispose(asset_env):
    prefix, context, factory, service, command, sessions = asset_env
    asset = await service.create(command, context)
    second_id = prefix + "-actor"
    async with sessions() as session:
        session.add(
            User(
                id=second_id,
                username=second_id,
                name="Other actor",
                passwordHash="unused",
                mustChangePassword=False,
                role="ADMIN",
            )
        )
        await session.commit()
    second_context = replace(
        context,
        actor=replace(
            context.actor,
            actor_id=second_id,
            access=replace(context.actor.access, user_id=second_id),
        ),
    )
    rendezvous = asyncio.Event()
    backend_pids = set()
    arrived = 0

    class RacingRepository:
        def __init__(self, original, uow):
            self.original, self.uow = original, uow

        def __getattr__(self, name):
            return getattr(self.original, name)

        async def get(self, asset_id, **options):
            nonlocal arrived
            if options.get("lock") and arrived < 2:
                pid = await self.uow._active_session().scalar(select(func.pg_backend_pid()))
                backend_pids.add(pid)
                arrived += 1
                if arrived == 2:
                    rendezvous.set()
                await asyncio.wait_for(rendezvous.wait(), timeout=5)
            return await self.original.get(asset_id, **options)

    def racing_factory():
        uow = factory()
        uow.assets = RacingRepository(uow.assets, uow)
        return uow

    from app.services.assets import AssetService

    racing_service = AssetService(racing_factory)
    try:
        # Separate actors deliberately avoid the shared actor-row lock serializing both requests.
        results = await asyncio.gather(
            racing_service.dispose(asset.id, movement(prefix, "0.20"), context),
            racing_service.dispose(asset.id, movement(prefix, "0.20"), second_context),
            return_exceptions=True,
        )
        assert len(backend_pids) == 2
        assert sum(not isinstance(result, BaseException) for result in results) == 1
        failure = next(result for result in results if isinstance(result, BaseException))
        assert isinstance(failure, DomainError) and failure.code == "INSUFFICIENT_QUANTITY"
        async with sessions() as session:
            row = await session.get(Asset, asset.id)
            assert row.quantity == Decimal("0.10")
            assert row.totalCost == Decimal("1.23")
            holding_total = await session.scalar(
                select(func.sum(AssetHolding.quantity)).where(AssetHolding.assetId == asset.id)
            )
            assert holding_total == row.quantity
            assert (
                await session.scalar(
                    select(func.count())
                    .select_from(Operation)
                    .where(Operation.assetId == asset.id, Operation.type == "DISPOSAL")
                )
                == 1
            )
    finally:
        async with sessions() as session:
            await clear_audit_logs_for_test_cleanup(session)
            await session.execute(AuditLog.__table__.delete().where(AuditLog.userId == second_id))
            await session.execute(User.__table__.delete().where(User.id == second_id))
            await session.commit()


@pytest.mark.anyio
async def test_transfer_preserves_total_and_denies_foreign_department(asset_env):
    prefix, context, factory, service, command, sessions = asset_env
    asset = await service.create(command, context)
    updated = await service.transfer(
        asset.id, movement(prefix, "0.10", toMolId=prefix + "-to"), context
    )
    assert updated.quantity == Decimal("0.30")
    assert sum(holding.quantity for holding in updated.holdings) == updated.quantity
    scoped = replace(
        context,
        actor=replace(
            context.actor,
            access=AccessContext(
                prefix,
                None,
                None,
                (),
                (ScopeGrant(prefix, "ASSET_CUSTODIAN", "ASSIGNED", "NONE", (prefix,)),),
            ),
        ),
    )
    with pytest.raises(DomainError) as error:
        await service.transfer(
            asset.id, movement(prefix, "0.10", toMolId=prefix + "-other"), scoped
        )
    assert error.value.code == "FORBIDDEN"
    current = await service.get(asset.id, context.actor)
    assert sum(holding.quantity for holding in current.holdings) == Decimal("0.30")


@pytest.mark.anyio
async def test_audit_failure_rolls_back_asset_holding_and_receipt(asset_env):
    prefix, context, factory, service, command, sessions = asset_env

    class FailingAudit:
        async def append(self, record):
            raise RuntimeError("injected audit failure")

    def failing_factory():
        uow = factory()
        uow.audit = FailingAudit()
        return uow

    from app.services.assets import AssetService

    with pytest.raises(RuntimeError, match="injected audit failure"):
        await AssetService(failing_factory).create(command, context)
    async with sessions() as session:
        assert (
            await session.scalar(
                select(func.count()).select_from(Asset).where(Asset.inventoryNumber == prefix)
            )
            == 0
        )
        assert (
            await session.scalar(
                select(func.count()).select_from(AuditLog).where(AuditLog.userId == prefix)
            )
            == 0
        )


@pytest.mark.anyio
async def test_inventory_overwrites_scan_rejects_repeat_complete_and_never_changes_stock(asset_env):
    prefix, context, factory, service, command, sessions = asset_env
    asset = await service.create(command, context)
    inventory = InventoryService(factory)
    sheet = await inventory.create_inventory(InventoryCommand("Проверка", prefix), context)
    first = await inventory.scan(sheet["id"], CountCommand(prefix, Decimal("0.10")), context)
    second = await inventory.scan(sheet["id"], CountCommand(prefix, Decimal("0.20")), context)
    assert first.id == second.id
    assert second.foundQuantity == Decimal("0.20")
    detail = await inventory.get_inventory(sheet["id"], context.actor)
    assert detail["summary"]["expectedQuantityTotal"] == "0.30"
    assert detail["summary"]["quantityDiscrepancies"] == 1
    await inventory.complete(sheet["id"], context)
    with pytest.raises(DomainError) as error:
        await inventory.complete(sheet["id"], context)
    assert error.value.code == "INVENTORY_COMPLETED"
    assert (await service.get(asset.id, context.actor)).quantity == Decimal("0.30")
    with pytest.raises(DomainError):
        await inventory.scan(sheet["id"], CountCommand(prefix, Decimal("0.30")), context)


@pytest.mark.anyio
async def test_maintenance_repair_restores_previous_status_and_archive_retains_history(asset_env):
    prefix, context, factory, service, command, sessions = asset_env
    asset = await service.create(replace(command, status="IN_STOCK"), context)
    maintenance = AssetLifecycleService(factory)
    record = await maintenance.create_maintenance(
        asset.id,
        MaintenanceCommand(type="REPAIR", title="Ремонт", scheduledDate=datetime(2026, 10, 2)),
        context,
    )
    await maintenance.update_maintenance(
        asset.id,
        record.id,
        MaintenanceCommand(status="IN_PROGRESS", present=frozenset({"status"})),
        context,
    )
    assert (await service.get(asset.id, context.actor)).status == "UNDER_REPAIR"
    await maintenance.update_maintenance(
        asset.id,
        record.id,
        MaintenanceCommand(status="COMPLETED", present=frozenset({"status"})),
        context,
    )
    assert (await service.get(asset.id, context.actor)).status == "IN_STOCK"
    await service.archive(asset.id, "На хранение", context)
    await service.archive(asset.id, "Повтор", context)
    current = await service.get(asset.id, context.actor)
    assert current.isArchived
    assert len([op for op in current.operations if op["documentType"] == "Архивирование"]) == 1
    assert (await service.restore(asset.id, context)).isArchived is False


@pytest.mark.anyio
async def test_project_all_scope_cannot_see_unassigned_assets(asset_env):
    prefix, context, factory, service, command, sessions = asset_env
    asset = await service.create(command, context)
    project_actor = replace(
        context.actor,
        access=AccessContext(
            prefix, None, None, (), (ScopeGrant(prefix, "PROJECT_MANAGER", "NONE", "ALL"),)
        ),
    )
    assert (await service.list(AssetQuery(search=prefix), project_actor)).assets == ()
    with pytest.raises(DomainError) as error:
        await service.get(asset.id, project_actor)
    assert error.value.code == "FORBIDDEN"


@pytest.mark.anyio
async def test_same_holder_transfer_cannot_create_extra_stock_through_typed_service(asset_env):
    prefix, context, factory, service, command, sessions = asset_env
    asset = await service.create(command, context)
    with pytest.raises(DomainError) as error:
        await service.transfer(asset.id, movement(prefix, "0.10", toMolId=prefix), context)
    assert error.value.code == "VALIDATION_ERROR"
    current = await service.get(asset.id, context.actor)
    assert sum(item.quantity for item in current.holdings) == current.quantity


@pytest.mark.anyio
async def test_asset_project_change_and_project_delete_share_project_before_asset_lock_order(
    asset_env,
):
    """Referenced project stays locked until reassignment; concurrent delete then clears its FK."""
    from app.models.projects import Project
    from app.services.assets import AssetService
    from app.services.dto.projects import ProjectCommand
    from app.services.projects import ProjectService

    prefix, context, factory, service, command, sessions = asset_env
    projects = ProjectService(factory)
    old = await projects.create(ProjectCommand(prefix + "-old", "Old"), context)
    new = await projects.create(ProjectCommand(prefix + "-new", "New"), context)
    asset = await service.create(replace(command, projectId=old.id), context)
    second_id = prefix + "-delete-actor"
    async with sessions() as session:
        session.add(
            User(
                id=second_id,
                username=second_id,
                name="Delete actor",
                passwordHash="unused",
                mustChangePassword=False,
                role="ADMIN",
            )
        )
        await session.commit()
    deleter_context = replace(
        context,
        actor=replace(
            context.actor,
            actor_id=second_id,
            access=replace(context.actor.access, user_id=second_id),
        ),
    )
    writer_ready = asyncio.Event()
    deleter_started = asyncio.Event()
    deleter_locked_project = asyncio.Event()
    writer_locked_new_project = False
    backend_pids = set()

    class Proxy:
        def __init__(self, original, uow, writer, project):
            self.original, self.uow, self.writer, self.project = original, uow, writer, project

        def __getattr__(self, key):
            return getattr(self.original, key)

        async def lock(self, identifier):
            nonlocal writer_locked_new_project
            if not self.writer:
                await asyncio.wait_for(writer_ready.wait(), 5)
                backend_pids.add(
                    await self.uow._active_session().scalar(select(func.pg_backend_pid()))
                )
                deleter_started.set()
            result = await self.original.lock(identifier)
            if identifier == new.id:
                if self.writer:
                    writer_locked_new_project = True
                    backend_pids.add(
                        await self.uow._active_session().scalar(select(func.pg_backend_pid()))
                    )
                    writer_ready.set()
                else:
                    deleter_locked_project.set()
            return result

        async def get(self, identifier, **options):
            if options.get("lock"):
                if writer_locked_new_project:
                    await asyncio.wait_for(deleter_started.wait(), 5)
                    return await self.original.get(identifier, **options)
                row = await self.original.get(identifier, **options)
                backend_pids.add(
                    await self.uow._active_session().scalar(select(func.pg_backend_pid()))
                )
                writer_ready.set()
                await asyncio.wait_for(deleter_locked_project.wait(), 5)
                return row
            return await self.original.get(identifier, **options)

    def writer_factory():
        uow = factory()
        uow.projects = Proxy(uow.projects, uow, True, True)
        uow.assets = Proxy(uow.assets, uow, True, False)
        return uow

    def deleter_factory():
        uow = factory()
        uow.projects = Proxy(uow.projects, uow, False, True)
        return uow

    try:
        results = await asyncio.gather(
            AssetService(writer_factory).update(
                asset.id, replace(command, projectId=new.id, editReason="Переназначение"), context
            ),
            ProjectService(deleter_factory).delete(new.id, deleter_context),
            return_exceptions=True,
        )
        assert all(not isinstance(result, BaseException) for result in results), [
            type(result).__name__ for result in results
        ]
        assert writer_locked_new_project
        assert len(backend_pids) == 2
        async with sessions() as session:
            current = await session.get(Asset, asset.id)
            assert current.projectId is None
            assert current.quantity == command.quantity
            assert await session.get(Project, new.id) is None
    finally:
        async with sessions() as session:
            await clear_audit_logs_for_test_cleanup(session)
            await session.execute(Project.__table__.delete().where(Project.code.like(prefix + "%")))
            await session.execute(AuditLog.__table__.delete().where(AuditLog.userId == second_id))
            await session.execute(User.__table__.delete().where(User.id == second_id))
            await session.commit()
