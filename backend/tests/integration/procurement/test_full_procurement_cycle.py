from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import func, select, update

from app.core.context import Actor, RequestContext
from app.db.uow import SqlAlchemyUnitOfWorkFactory
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.domain.errors import DomainError
from app.models.approvals import ApprovalRequest
from app.models.assets import Asset, AssetHolding, Operation
from app.models.catalogs import AssetGroup, Mol
from app.models.departments import Department
from app.models.enums import ApprovalRequestStatus, UserRole
from app.models.procurement import ProcurementDeliveryItem, ProcurementRequest
from app.models.users import User
from app.repositories.approvals import SqlAlchemyApprovalRepository
from app.repositories.audit import SqlAlchemyAuditRepository
from app.services.dto.procurement import (
    ProcurementCapitalizeCommand,
    ProcurementCommand,
    ProcurementContractCommand,
    ProcurementDeliveryCommand,
    ProcurementDeliveryLineCommand,
    ProcurementItemCommand,
    ProcurementSubmitCommand,
    SupplierCommand,
)
from app.services.procurement import ProcurementService


@pytest.mark.anyio
async def test_request_approval_contract_partial_deliveries_and_capitalization(
    stage11_session_factory, monkeypatch,
) -> None:
    suffix = uuid4().hex[:10]
    owner_id, approver_id = f"owner-{suffix}", f"approver-{suffix}"
    department_id, group_id, mol_id = f"dept-{suffix}", f"group-{suffix}", f"mol-{suffix}"
    async with stage11_session_factory() as session:
        session.add_all(
            [
                User(id=owner_id, username=f"owner-{suffix}", name="Закупщик",
                     passwordHash="hash", role=UserRole.ADMIN, mustChangePassword=False),
                User(id=approver_id, username=f"approver-{suffix}", name="Согласующий",
                     passwordHash="hash", role=UserRole.ADMIN, mustChangePassword=False),
                Department(id=department_id, code=f"D-{suffix}", name=f"Отдел {suffix}"),
                AssetGroup(id=group_id, code=f"G-{suffix}", name=f"Оборудование {suffix}"),
            ]
        )
        await session.flush()
        session.add(
            Mol(
                id=mol_id,
                code=f"M-{suffix}",
                department=f"Отдел {suffix}",
                departmentId=department_id,
                fullName="МОЛ",
                storageLocation="Склад",
            )
        )
        await session.commit()

    context = RequestContext(
        request_id=f"req-{suffix}",
        actor=Actor(
            actor_id=owner_id,
            roles=("ADMIN",),
            is_authenticated=True,
            session_version=1,
            access=AccessContext(
                user_id=owner_id,
                employee_id=None,
                employee_department_id=None,
                member_project_ids=(),
                grants=(ScopeGrant("admin", "ADMIN", "ALL", "ALL"),),
            ),
        ),
    )
    service = ProcurementService(SqlAlchemyUnitOfWorkFactory(stage11_session_factory))
    supplier = await service.create_supplier(SupplierCommand(name=f"Supplier {suffix}"), context)
    created = await service.create(
        ProcurementCommand(
            number=f"PR-{suffix}",
            title="Сетевое оборудование",
            budgetLimit=Decimal("300"),
            items=(
                ProcurementItemCommand(
                    name="Коммутатор", quantity=Decimal("3"), unit="шт",
                    unitPrice=Decimal("100"), groupId=group_id,
                ),
            ),
        ),
        context,
    )
    item_id = created["items"][0]["id"]

    approval_create = SqlAlchemyApprovalRepository.create

    async def fail_after_approval_create(repository, values, steps):
        await approval_create(repository, values, steps)
        raise RuntimeError("forced approval failure")

    monkeypatch.setattr(SqlAlchemyApprovalRepository, "create", fail_after_approval_create)
    with pytest.raises(RuntimeError, match="forced approval failure"):
        await service.submit(
            created["id"],
            ProcurementSubmitCommand((("Руководитель", approver_id),)),
            context,
        )
    monkeypatch.setattr(SqlAlchemyApprovalRepository, "create", approval_create)
    async with stage11_session_factory() as session:
        request_row = await session.get(ProcurementRequest, created["id"])
        orphan_approval = await session.scalar(
            select(ApprovalRequest).where(
                ApprovalRequest.entityType == "ProcurementRequest",
                ApprovalRequest.entityId == created["id"],
            )
        )
        assert request_row is not None and request_row.status.value == "DRAFT"
        assert orphan_approval is None

    submitted = await service.submit(
        created["id"],
        ProcurementSubmitCommand(
            (("Руководитель", approver_id),),
            datetime.now(UTC) + timedelta(days=1),
        ),
        context,
    )
    assert submitted["status"] == "SUBMITTED"
    assert submitted["approvalRequest"]["id"]
    with pytest.raises(DomainError) as duplicate_submit:
        await service.submit(
            created["id"],
            ProcurementSubmitCommand((("Руководитель", approver_id),)),
            context,
        )
    assert duplicate_submit.value.code == "INVALID_PROCUREMENT_STATE"
    async with stage11_session_factory() as session:
        approval_count = await session.scalar(
            select(func.count(ApprovalRequest.id)).where(
                ApprovalRequest.entityType == "ProcurementRequest",
                ApprovalRequest.entityId == created["id"],
            )
        )
        assert approval_count == 1
        await session.execute(
            update(ApprovalRequest)
            .where(ApprovalRequest.id == submitted["approvalRequest"]["id"])
            .values(status=ApprovalRequestStatus.APPROVED)
        )
        await session.commit()

    contracted = await service.create_contract(
        created["id"],
        ProcurementContractCommand(
            supplierId=supplier["id"], number=f"C-{suffix}", amount=Decimal("300"),
            signedAt=date.today(), deliveryDueAt=date.today() + timedelta(days=20),
        ),
        context,
    )
    assert contracted["status"] == "CONTRACTED"
    first = await service.create_delivery(
        created["id"],
        ProcurementDeliveryCommand(
            number="1", receivedAt=date.today(),
            items=(ProcurementDeliveryLineCommand(item_id, Decimal("1")),),
        ),
        context,
    )
    assert first["status"] == "PARTIALLY_DELIVERED"
    second = await service.create_delivery(
        created["id"],
        ProcurementDeliveryCommand(
            number="2", receivedAt=date.today(),
            items=(ProcurementDeliveryLineCommand(item_id, Decimal("2")),),
        ),
        context,
    )
    assert second["status"] == "DELIVERED"
    assert second["items"][0]["deliveredQuantity"] == Decimal("3.00")
    delivery_items = [line for delivery in second["deliveries"] for line in delivery["items"]]
    assert len(delivery_items) == 2

    first_line = delivery_items[0]
    append_audit = SqlAlchemyAuditRepository.append

    async def fail_asset_audit(repository, record):
        if record.action == "ASSET_CREATE":
            raise RuntimeError("forced asset audit failure")
        await append_audit(repository, record)

    monkeypatch.setattr(SqlAlchemyAuditRepository, "append", fail_asset_audit)
    with pytest.raises(RuntimeError, match="forced asset audit failure"):
        await service.capitalize(
            first_line["id"],
            ProcurementCapitalizeCommand(
                inventoryNumber=f"INV-FAIL-{suffix}", molId=mol_id
            ),
            context,
        )
    monkeypatch.setattr(SqlAlchemyAuditRepository, "append", append_audit)
    async with stage11_session_factory() as session:
        failed_asset = await session.scalar(
            select(Asset).where(Asset.inventoryNumber == f"INV-FAIL-{suffix}")
        )
        failed_link = await session.get(ProcurementDeliveryItem, first_line["id"])
        failed_holding = await session.scalar(
            select(AssetHolding.id).where(
                AssetHolding.assetId.in_(
                    select(Asset.id).where(Asset.inventoryNumber == f"INV-FAIL-{suffix}")
                )
            )
        )
        failed_operations = await session.scalar(
            select(Operation.id).where(
                Operation.assetId.in_(
                    select(Asset.id).where(Asset.inventoryNumber == f"INV-FAIL-{suffix}")
                )
            )
        )
        assert failed_asset is None
        assert failed_link is not None and failed_link.assetId is None
        assert failed_holding is None
        assert failed_operations is None

    for index, line in enumerate(delivery_items, start=1):
        if index == 1:
            attempts = await asyncio.gather(
                *(
                    service.capitalize(
                        line["id"],
                        ProcurementCapitalizeCommand(
                            inventoryNumber=f"INV-{suffix}-{attempt}", molId=mol_id
                        ),
                        context,
                    )
                    for attempt in (1, 2)
                ),
                return_exceptions=True,
            )
            successes = [value for value in attempts if isinstance(value, dict)]
            failures = [value for value in attempts if isinstance(value, DomainError)]
            assert len(successes) == 1
            assert len(failures) == 1 and failures[0].code == "ALREADY_CAPITALIZED"
            continue
        result = await service.capitalize(
            line["id"],
            ProcurementCapitalizeCommand(
                inventoryNumber=f"INV-{suffix}-{index}", molId=mol_id
            ),
            context,
        )
        assert result["inventoryNumber"] == f"INV-{suffix}-{index}"

    final = await service.get(created["id"], context)
    assert final["status"] == "CAPITALIZED"
    assert final["totalPlanned"] == Decimal("300.00")
    assert sum((asset["quantity"] for delivery in final["deliveries"]
                for asset in delivery["items"]), Decimal(0)) == Decimal("3.00")
    async with stage11_session_factory() as session:
        request_row = await session.get(ProcurementRequest, created["id"])
        assets = list((await session.scalars(select(Asset).where(
            Asset.inventoryNumber.like(f"INV-{suffix}-%")
        ))).all())
        linked = await session.scalar(
            select(AssetHolding).where(AssetHolding.assetId == assets[0].id)
        )
        operations = list((await session.scalars(
            select(Operation).where(Operation.assetId.in_([asset.id for asset in assets]))
        )).all())
        assert request_row is not None and request_row.status.value == "CAPITALIZED"
        assert len(assets) == 2
        assert all(
            asset.recordingDate == datetime.combine(date.today(), datetime.min.time())
            for asset in assets
        )
        assert linked is not None
        assert len(operations) == 2
