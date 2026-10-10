import asyncio
from datetime import datetime
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.core.context import Actor, RequestContext
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.domain.errors import DomainError
from app.models.assets import Asset
from app.models.catalogs import AssetGroup
from app.models.users import AuditLog, User
from app.repositories.users import SqlAlchemyUserRepository
from app.services.dto.catalogs import GroupCommand, MolCommand
from app.services.dto.departments import DepartmentCommand
from tests.stage04_support import wire


def group_command(prefix: str, *, code: str = "G") -> GroupCommand:
    return GroupCommand(
        name="Furniture",
        code=prefix + code,
        description="Seed",
        present_fields=frozenset({"name", "code", "description"}),
    )


def mol_command(prefix: str, department_id: str, *, code: str = "M") -> MolCommand:
    return MolCommand(
        code=prefix + code,
        department_id=department_id,
        full_name="Stage04 Responsible",
        storage_location="Room 1",
        present_fields=frozenset({"code", "department_id", "full_name", "storage_location"}),
    )


@pytest.mark.anyio
async def test_catalog_mutation_rechecks_actor_under_user_row_lock(organization_env, monkeypatch):
    env = organization_env
    actor = env["actor"]
    actor_lookup_started = asyncio.Event()
    original_get = SqlAlchemyUserRepository.get

    async def observe_actor_lock(repository, user_id: str, *, for_update: bool = False):
        if user_id == actor.actor_id and for_update:
            actor_lookup_started.set()
        return await original_get(repository, user_id, for_update=for_update)

    monkeypatch.setattr(SqlAlchemyUserRepository, "get", observe_actor_lock)
    async with env["sessions"]() as lock_owner:
        await lock_owner.execute(select(User).where(User.id == actor.actor_id).with_for_update())
        pending = asyncio.create_task(
            env["catalogs"].create_group(group_command(env["prefix"]), env["context"])
        )
        await asyncio.wait_for(actor_lookup_started.wait(), timeout=3)
        user = await lock_owner.get(User, actor.actor_id)
        user.sessionVersion += 1
        await lock_owner.commit()
        with pytest.raises(DomainError) as stale_session:
            await pending
    assert stale_session.value.code == "UNAUTHENTICATED"
    async with env["sessions"]() as session:
        assert (
            await session.scalar(
                select(func.count())
                .select_from(AssetGroup)
                .where(AssetGroup.code == env["prefix"] + "G")
            )
            == 0
        )


@pytest.mark.anyio
async def test_group_crud_audits_and_duplicate_error(organization_env):
    env = organization_env
    context = env["context"]
    catalogs = env["catalogs"]
    command = group_command(env["prefix"])
    created = wire(await catalogs.create_group(command, context))
    env["group_ids"].append(created["id"])
    assert created["code"] == env["prefix"] + "G"

    with pytest.raises(DomainError) as duplicate:
        await catalogs.create_group(command, context)
    assert duplicate.value.code == "CODE_EXISTS"

    updated = wire(
        await catalogs.update_group(
            created["id"],
            GroupCommand(
                name="Chairs", code=created["code"], present_fields=frozenset({"name", "code"})
            ),
            context,
        )
    )
    assert updated["name"] == "Chairs"
    details = wire(await catalogs.get_group(created["id"], env["actor"]))
    assert details["_count"] == {"assets": 0}
    assert await catalogs.delete_group(created["id"], context) == {"success": True}

    async with env["sessions"]() as session:
        events = list(
            await session.scalars(
                select(AuditLog)
                .where(AuditLog.entityType == "AssetGroup", AuditLog.entityId == created["id"])
                .order_by(AuditLog.createdAt.asc())
            )
        )
    assert [event.action for event in events] == [
        "ASSET_GROUP_CREATE",
        "ASSET_GROUP_UPDATE",
        "ASSET_GROUP_DELETE",
    ]
    assert events[0].details == {
        "after": {"id": created["id"], "code": created["code"], "name": "Furniture"}
    }
    assert events[1].details == {
        "before": {"code": created["code"], "name": "Furniture"},
        "after": {"code": created["code"], "name": "Chairs"},
    }
    assert events[2].details == {"before": {"code": created["code"], "name": "Chairs"}}


@pytest.mark.anyio
async def test_mol_department_resolution_scope_filter_direct_id_and_audit(organization_env):
    env = organization_env
    catalogs = env["catalogs"]
    context = env["context"]
    first = wire(
        await env["departments"].create(DepartmentCommand(code="mol-first", name="First"), context)
    )
    second = wire(
        await env["departments"].create(
            DepartmentCommand(code="mol-second", name="Second"), context
        )
    )
    env["department_ids"].extend((first["id"], second["id"]))
    mol1 = wire(await catalogs.create_mol(mol_command(env["prefix"], first["id"]), context))
    mol2 = wire(
        await catalogs.create_mol(
            MolCommand(
                code=env["prefix"] + "M2",
                department="Second",
                full_name="Other Responsible",
                storage_location="Room 2",
                present_fields=frozenset({"code", "department", "full_name", "storage_location"}),
            ),
            context,
        )
    )
    env["mol_ids"].extend((mol1["id"], mol2["id"]))
    with pytest.raises(DomainError) as duplicate:
        await catalogs.create_mol(mol_command(env["prefix"], first["id"]), context)
    assert duplicate.value.code == "CODE_EXISTS"

    scoped_actor = Actor(
        actor_id=env["actor"].actor_id,
        is_authenticated=True,
        session_version=1,
        access=AccessContext(
            user_id=env["actor"].actor_id,
            employee_id=None,
            employee_department_id=None,
            member_project_ids=(),
            grants=(
                ScopeGrant(
                    env["prefix"] + "-asset",
                    "ASSET_CUSTODIAN",
                    "ASSIGNED",
                    "NONE",
                    department_ids=(first["id"],),
                ),
            ),
        ),
    )
    visible = await catalogs.list_mols(scoped_actor)
    assert [row.id for row in visible] == [mol1["id"]]
    assert (await catalogs.get_mol(mol1["id"], scoped_actor)).id == mol1["id"]
    with pytest.raises(DomainError) as forbidden:
        await catalogs.get_mol(mol2["id"], scoped_actor)
    assert forbidden.value.code == "FORBIDDEN"
    with pytest.raises(DomainError) as missing_create_department:
        await catalogs.create_mol(
            MolCommand(
                code=env["prefix"] + "MISSING",
                department_id=env["prefix"] + "-unknown-department",
                full_name="Not found",
                storage_location="Room",
                present_fields=frozenset(
                    {"code", "department_id", "full_name", "storage_location"}
                ),
            ),
            RequestContext("missing-create-department", actor=scoped_actor),
        )
    assert missing_create_department.value.code == "NOT_FOUND"
    with pytest.raises(DomainError) as missing_update_department:
        await catalogs.update_mol(
            mol1["id"],
            MolCommand(
                code=mol1["code"],
                department_id=env["prefix"] + "-unknown-department",
                full_name="Not found",
                storage_location="Room",
                present_fields=frozenset(
                    {"code", "department_id", "full_name", "storage_location"}
                ),
            ),
            RequestContext("missing-update-department", actor=scoped_actor),
        )
    assert missing_update_department.value.code == "NOT_FOUND"
    with pytest.raises(DomainError) as foreign_destination:
        await catalogs.update_mol(
            mol1["id"],
            MolCommand(
                code=mol1["code"],
                department_id=second["id"],
                full_name="Outside",
                storage_location="Room",
                present_fields=frozenset(
                    {"code", "department_id", "full_name", "storage_location"}
                ),
            ),
            RequestContext("foreign-destination", actor=scoped_actor),
        )
    assert foreign_destination.value.code == "FORBIDDEN"
    assert [row.id for row in (await catalogs.mol_references(scoped_actor)).departments] == [
        first["id"]
    ]

    updated = wire(
        await catalogs.update_mol(
            mol1["id"],
            MolCommand(
                code=mol1["code"],
                department_id=first["id"],
                full_name="Updated Responsible",
                storage_location="Room 1B",
                present_fields=frozenset(
                    {"code", "department_id", "full_name", "storage_location"}
                ),
            ),
            context,
        )
    )
    assert updated["photo"] is None
    assert await catalogs.delete_mol(mol1["id"], context) == {"success": True}
    keeper = wire(
        await catalogs.create_mol(mol_command(env["prefix"], first["id"], code="KEEP"), context)
    )
    env["mol_ids"].append(keeper["id"])
    with pytest.raises(DomainError) as in_use_department:
        await env["departments"].delete(first["id"], context)
    assert in_use_department.value.code == "IN_USE"

    async with env["sessions"]() as session:
        events = list(
            await session.scalars(
                select(AuditLog)
                .where(AuditLog.entityType == "Mol", AuditLog.entityId == mol1["id"])
                .order_by(AuditLog.createdAt.asc())
            )
        )
        assert [event.action for event in events] == ["MOL_CREATE", "MOL_UPDATE", "MOL_DELETE"]
        assert events[0].details == {
            "after": {
                "id": mol1["id"],
                "code": mol1["code"],
                "fullName": "Stage04 Responsible",
                "departmentId": first["id"],
                "department": "First",
            }
        }
        assert events[1].details["before"] == {
            "code": mol1["code"],
            "fullName": "Stage04 Responsible",
            "departmentId": first["id"],
            "department": "First",
        }
        assert events[2].details["before"]["fullName"] == "Updated Responsible"


@pytest.mark.anyio
async def test_mol_reference_and_delete_errors_and_department_usage(organization_env):
    env = organization_env
    context = env["context"]
    service = env["catalogs"]
    for command, code in (
        (
            MolCommand(
                code="x", full_name="Name", storage_location="Room", present_fields=frozenset()
            ),
            "DEPARTMENT_REQUIRED",
        ),
        (mol_command(env["prefix"], "missing"), "NOT_FOUND"),
    ):
        with pytest.raises(DomainError) as failure:
            await service.create_mol(command, context)
        assert failure.value.code == code

    department = wire(
        await env["departments"].create(DepartmentCommand(code="mol-used", name="Used"), context)
    )
    env["department_ids"].append(department["id"])
    mol = wire(await service.create_mol(mol_command(env["prefix"], department["id"]), context))
    env["mol_ids"].append(mol["id"])
    group = wire(await service.create_group(group_command(env["prefix"]), context))
    env["group_ids"].append(group["id"])
    asset_id = env["prefix"] + "-asset"
    env["asset_ids"].append(asset_id)
    async with env["sessions"]() as session:
        session.add(
            Asset(
                id=asset_id,
                name="Test asset",
                inventoryNumber=asset_id,
                unitPrice=Decimal("10.00"),
                unitOfMeasure="шт.",
                quantity=Decimal("1.00"),
                totalCost=Decimal("10.00"),
                molId=mol["id"],
                groupId=group["id"],
                recordingDate=datetime(2026, 1, 1),
                documentType="Счёт",
                documentDetails="Test",
            )
        )
        await session.commit()
    with pytest.raises(DomainError) as mol_used:
        await service.delete_mol(mol["id"], context)
    assert mol_used.value.code == "IN_USE"
    with pytest.raises(DomainError) as group_used:
        await service.delete_group(group["id"], context)
    assert group_used.value.code == "IN_USE"
    with pytest.raises(DomainError) as department_used:
        await env["departments"].delete(department["id"], context)
    assert department_used.value.code == "IN_USE"
    async with env["sessions"]() as session:
        assert (
            await session.scalar(
                select(func.count()).select_from(Asset).where(Asset.id == asset_id)
            )
            == 1
        )


@pytest.mark.anyio
async def test_mol_references_intersect_permissions_and_exclude_inactive_departments(
    organization_env,
):
    env = organization_env
    context = env["context"]
    departments = env["departments"]
    readable = wire(
        await departments.create(DepartmentCommand(code="ref-in", name="Readable"), context)
    )
    outside_department_read = wire(
        await departments.create(DepartmentCommand(code="ref-out", name="Outside read"), context)
    )
    inactive = wire(
        await departments.create(DepartmentCommand(code="ref-off", name="Inactive"), context)
    )
    env["department_ids"].extend((readable["id"], outside_department_read["id"], inactive["id"]))
    await departments.update(inactive["id"], DepartmentCommand(is_active=False), context)
    scoped_actor = Actor(
        actor_id=env["actor"].actor_id,
        is_authenticated=True,
        session_version=1,
        access=AccessContext(
            user_id=env["actor"].actor_id,
            employee_id=None,
            employee_department_id=None,
            member_project_ids=(),
            grants=(
                ScopeGrant(
                    env["prefix"] + "-hr",
                    "HR",
                    "ASSIGNED",
                    "NONE",
                    department_ids=(readable["id"], outside_department_read["id"]),
                ),
                ScopeGrant(
                    env["prefix"] + "-asset",
                    "ASSET_CUSTODIAN",
                    "ASSIGNED",
                    "NONE",
                    department_ids=(readable["id"], inactive["id"]),
                ),
            ),
        ),
    )

    result = await env["catalogs"].mol_references(scoped_actor)

    assert [(item.id, item.code, item.name, item.is_active) for item in result.departments] == [
        (readable["id"], "REF-IN", "Readable", True)
    ]
