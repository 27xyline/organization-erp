from datetime import datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import delete

from app.core.context import Actor, RequestContext
from app.db.uow import create_unit_of_work_factory
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.models.assets import Asset, AssetInventory, Operation
from app.models.catalogs import AssetGroup, Mol
from app.models.departments import Department
from app.models.users import AuditLog, User
from app.services.assets import AssetService
from app.services.dto.assets import AssetCommand
from tests.audit_cleanup import clear_audit_logs_for_test_cleanup


@pytest.fixture
async def asset_env(db_session_factory):
    prefix = "s7-" + uuid4().hex
    context = RequestContext(
        prefix,
        actor=Actor(
            prefix,
            is_authenticated=True,
            session_version=1,
            access=AccessContext(
                prefix, None, None, (), (ScopeGrant(prefix, "ADMIN", "ALL", "ALL"),)
            ),
        ),
    )
    async with db_session_factory() as session:
        session.add_all(
            [
                User(
                    id=prefix,
                    username=prefix,
                    name="assets",
                    passwordHash="unused",
                    mustChangePassword=False,
                    role="ADMIN",
                ),
                Department(id=prefix, code=prefix, name=prefix),
                Department(id=prefix + "-other", code=prefix + "-other", name=prefix + "-other"),
                AssetGroup(id=prefix, code=prefix, name=prefix),
            ]
        )
        await session.flush()
        session.add_all(
            [
                Mol(
                    id=prefix,
                    code=prefix,
                    departmentId=prefix,
                    department=prefix,
                    fullName="Source",
                    storageLocation="Source",
                ),
                Mol(
                    id=prefix + "-to",
                    code=prefix + "-to",
                    departmentId=prefix,
                    department=prefix,
                    fullName="Destination",
                    storageLocation="Destination",
                ),
                Mol(
                    id=prefix + "-other",
                    code=prefix + "-other",
                    departmentId=prefix + "-other",
                    department=prefix + "-other",
                    fullName="Other",
                    storageLocation="Other",
                ),
            ]
        )
        await session.commit()
    factory = create_unit_of_work_factory(db_session_factory)
    command = AssetCommand(
        "assets asset",
        prefix,
        Decimal("12.34"),
        "шт",
        Decimal("0.30"),
        prefix,
        prefix,
        datetime(2026, 10, 1),
        "Акт",
        "Initial",
    )
    service = AssetService(factory)
    try:
        yield prefix, context, factory, service, command, db_session_factory
    finally:
        async with db_session_factory() as session:
            await clear_audit_logs_for_test_cleanup(session)
            await session.execute(
                delete(AssetInventory).where(AssetInventory.createdById == prefix)
            )
            await session.execute(
                delete(Operation).where(Operation.assetId.in_(select_asset_ids(prefix)))
            )
            await session.execute(delete(Asset).where(Asset.inventoryNumber.like(prefix + "%")))
            await session.execute(delete(AuditLog).where(AuditLog.userId == prefix))
            await session.execute(delete(Mol).where(Mol.id.like(prefix + "%")))
            await session.execute(delete(AssetGroup).where(AssetGroup.id == prefix))
            await session.execute(delete(Department).where(Department.id.like(prefix + "%")))
            await session.execute(delete(User).where(User.id == prefix))
            await session.commit()


def select_asset_ids(prefix):
    from sqlalchemy import select

    return select(Asset.id).where(Asset.inventoryNumber.like(prefix + "%"))
