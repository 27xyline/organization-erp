from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.core.context import Actor, RequestContext
from app.db.uow import SqlAlchemyUnitOfWorkFactory
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.domain.errors import DomainError
from app.models.assets import Asset
from app.models.catalogs import AssetGroup, Mol, Supplier
from app.models.departments import Department
from app.models.enums import ProcurementStatus, UserRole
from app.models.procurement import (
    ProcurementContract,
    ProcurementDelivery,
    ProcurementDeliveryItem,
    ProcurementItem,
    ProcurementRequest,
)
from app.models.users import User
from app.services.dto.procurement import ProcurementCapitalizeCommand
from app.services.procurement import ProcurementService


@pytest.mark.anyio
async def test_scoped_asset_custodian_options_and_capitalization(
    stage11_session_factory,
) -> None:
    suffix = uuid4().hex[:10]
    user_id = f"custodian-{suffix}"
    allowed_department_id = f"allowed-dept-{suffix}"
    denied_department_id = f"denied-dept-{suffix}"
    allowed_mol_id = f"allowed-mol-{suffix}"
    denied_mol_id = f"denied-mol-{suffix}"
    group_id = f"group-{suffix}"
    supplier_id = f"supplier-{suffix}"
    request_id, item_id = f"request-{suffix}", f"item-{suffix}"
    contract_id, delivery_id = f"contract-{suffix}", f"delivery-{suffix}"
    delivery_item_id = f"delivery-item-{suffix}"
    inventory_number = f"SCOPED-{suffix}"

    async with stage11_session_factory() as session:
        session.add_all(
            [
                User(
                    id=user_id,
                    username=user_id,
                    name="Хранитель имущества",
                    passwordHash="hash",
                    role=UserRole.VIEWER,
                    mustChangePassword=False,
                ),
                Department(
                    id=allowed_department_id,
                    code=f"A-{suffix}",
                    name=f"Разрешённый {suffix}",
                ),
                Department(id=denied_department_id, code=f"D-{suffix}", name=f"Чужой {suffix}"),
                AssetGroup(id=group_id, code=f"G-{suffix}", name=f"Группа {suffix}"),
                Supplier(id=supplier_id, name=f"Поставщик {suffix}"),
                ProcurementRequest(
                    id=request_id,
                    number=f"PR-{suffix}",
                    title="Поставка для учёта",
                    status=ProcurementStatus.DELIVERED,
                    budgetLimit=Decimal("100"),
                    requestedById=user_id,
                ),
            ]
        )
        await session.flush()
        session.add_all(
            [
                Mol(id=allowed_mol_id, code=f"MA-{suffix}", department="Разрешённый",
                    departmentId=allowed_department_id, fullName="МОЛ A", storageLocation="A"),
                Mol(id=denied_mol_id, code=f"MD-{suffix}", department="Чужой",
                    departmentId=denied_department_id, fullName="МОЛ D", storageLocation="D"),
                ProcurementItem(
                    id=item_id, requestId=request_id, name="Принтер", quantity=Decimal("1"),
                    unit="шт", unitPrice=Decimal("100"), groupId=group_id,
                ),
                ProcurementContract(
                    id=contract_id, requestId=request_id, supplierId=supplier_id,
                    number=f"C-{suffix}", amount=Decimal("100"), signedAt=date.today(),
                    deliveryDueAt=date.today(),
                ),
            ]
        )
        await session.flush()
        session.add(
            ProcurementDelivery(
                id=delivery_id, requestId=request_id, contractId=contract_id,
                number="1", receivedAt=date.today(),
            )
        )
        await session.flush()
        session.add(
            ProcurementDeliveryItem(
                id=delivery_item_id, deliveryId=delivery_id, procurementItemId=item_id,
                quantity=Decimal("1"),
            )
        )
        await session.commit()

    access = AccessContext(
        user_id=user_id,
        employee_id=None,
        employee_department_id=None,
        member_project_ids=(),
        grants=(
            ScopeGrant(
                "custodian-scope",
                "ASSET_CUSTODIAN",
                "ASSIGNED",
                "NONE",
                department_ids=(allowed_department_id,),
            ),
        ),
    )
    context = RequestContext(
        request_id=f"scope-{suffix}",
        actor=Actor(
            actor_id=user_id,
            roles=("ASSET_CUSTODIAN",),
            is_authenticated=True,
            session_version=1,
            access=access,
        ),
    )
    service = ProcurementService(SqlAlchemyUnitOfWorkFactory(stage11_session_factory))

    options = await service.options(context)
    assert [mol["id"] for mol in options["mols"]] == [allowed_mol_id]

    with pytest.raises(DomainError) as denied:
        await service.capitalize(
            delivery_item_id,
            ProcurementCapitalizeCommand(inventoryNumber=inventory_number, molId=denied_mol_id),
            context,
        )
    assert denied.value.code == "FORBIDDEN"
    assert denied.value.status_code == 403
    async with stage11_session_factory() as session:
        assert await session.scalar(
            select(Asset.id).where(Asset.inventoryNumber == inventory_number)
        ) is None
        line = await session.get(ProcurementDeliveryItem, delivery_item_id)
        assert line is not None and line.assetId is None

    created = await service.capitalize(
        delivery_item_id,
        ProcurementCapitalizeCommand(
            inventoryNumber=f"ALLOWED-{suffix}", molId=allowed_mol_id
        ),
        context,
    )
    assert created["inventoryNumber"] == f"ALLOWED-{suffix}"
