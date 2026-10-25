import asyncio
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.core.context import Actor, RequestContext
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.domain.errors import DomainError
from app.models.catalogs import Mol
from app.models.departments import Department
from app.models.employees import Employee
from app.models.enums import EmployeeStatus
from app.models.timekeeping import StaffSchedule
from app.models.users import AuditLog, User
from app.repositories.audit import SqlAlchemyAuditRepository
from app.repositories.users import SqlAlchemyUserRepository
from app.services.dto.catalogs import MolCommand
from app.services.dto.departments import DepartmentCommand, DepartmentListQuery
from tests.organization_support import wire


@pytest.mark.anyio
async def test_department_create_normalize_duplicate_cycle_head_and_used_delete(organization_env):
    env = organization_env
    service = env["departments"]
    context = env["context"]
    root = wire(
        await service.create(DepartmentCommand(code=" root ", name="  Root   Office "), context)
    )
    env["department_ids"].append(root["id"])
    child = wire(
        await service.create(
            DepartmentCommand(code="child", name="Child", parent_id=root["id"]), context
        )
    )
    env["department_ids"].append(child["id"])
    assert root["code"] == "ROOT"
    assert root["name"] == "Root Office"

    for command, code in (
        (DepartmentCommand(code="root", name="Different"), "CODE_EXISTS"),
        (DepartmentCommand(code="other", name=" root office "), "NAME_EXISTS"),
        (
            DepartmentCommand(parent_id=child["id"], parent_id_set=True),
            "CYCLIC_HIERARCHY",
        ),
        (
            DepartmentCommand(head_employee_id="missing", head_employee_id_set=True),
            "HEAD_NOT_FOUND",
        ),
    ):
        with pytest.raises(DomainError) as failure:
            if code == "CYCLIC_HIERARCHY":
                await service.update(root["id"], command, context)
            else:
                await service.create(
                    DepartmentCommand(
                        code=command.code or "new",
                        name=command.name or "New department",
                        parent_id=command.parent_id,
                        parent_id_set=command.parent_id_set,
                        head_employee_id=command.head_employee_id,
                        head_employee_id_set=command.head_employee_id_set,
                    ),
                    context,
                )
        assert failure.value.code == code

    with pytest.raises(DomainError) as in_use:
        await service.delete(root["id"], context)
    assert in_use.value.code == "IN_USE"
    assert await service.delete(child["id"], context) == {"success": True}
    assert await service.delete(root["id"], context) == {"success": True}


@pytest.mark.anyio
async def test_department_scope_filters_list_and_direct_update_target(organization_env):
    env = organization_env
    visible = wire(
        await env["departments"].create(
            DepartmentCommand(code="visible", name="Visible"), env["context"]
        )
    )
    hidden = wire(
        await env["departments"].create(
            DepartmentCommand(code="hidden", name="Hidden"), env["context"]
        )
    )
    env["department_ids"].extend((visible["id"], hidden["id"]))
    actor = Actor(
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
                    department_ids=(visible["id"],),
                ),
            ),
        ),
    )
    listed = await env["departments"].list(DepartmentListQuery(), actor)
    assert [row.id for row in listed] == [visible["id"]]
    with pytest.raises(DomainError) as forbidden:
        await env["departments"].update(
            hidden["id"], DepartmentCommand(name="Tampered"), RequestContext("scope", actor=actor)
        )
    assert forbidden.value.code == "FORBIDDEN"


@pytest.mark.anyio
async def test_department_rename_updates_denormalized_snapshots_and_audit_atomically(
    organization_env, monkeypatch
):
    env = organization_env
    context = env["context"]
    department = wire(
        await env["departments"].create(DepartmentCommand(code="rename", name="Before"), context)
    )
    env["department_ids"].append(department["id"])
    employee_id = env["prefix"] + "-employee"
    schedule_id = env["prefix"] + "-schedule"
    env["employee_ids"].append(employee_id)
    env["staff_schedule_ids"].append(schedule_id)
    async with env["sessions"]() as session:
        session.add(
            Employee(
                id=employee_id,
                code=employee_id,
                fullName="organization Employee",
                department="Before",
                departmentId=department["id"],
                status=EmployeeStatus.ACTIVE,
            )
        )
        session.add(
            StaffSchedule(
                id=schedule_id,
                position="Analyst",
                department="Before",
                departmentId=department["id"],
                rate=Decimal("1.00"),
                salary=Decimal("1000.00"),
            )
        )
        await session.commit()
    mol = wire(
        await env["catalogs"].create_mol(
            MolCommand(
                code=env["prefix"],
                department="Before",
                full_name="organization MOL",
                storage_location="Room 1",
                present_fields=frozenset({"code", "department", "full_name", "storage_location"}),
            ),
            context,
        )
    )
    env["mol_ids"].append(mol["id"])

    await env["departments"].update(department["id"], DepartmentCommand(name="After"), context)
    async with env["sessions"]() as session:
        snapshots = (
            await session.execute(
                select(Employee.department, StaffSchedule.department, Mol.department)
                .select_from(Employee)
                .join(StaffSchedule, StaffSchedule.id == schedule_id)
                .join(Mol, Mol.id == mol["id"])
                .where(Employee.id == employee_id)
            )
        ).one()
        assert snapshots == ("After", "After", "After")
        audit = await session.scalar(
            select(AuditLog)
            .where(AuditLog.entityType == "Department", AuditLog.entityId == department["id"])
            .order_by(AuditLog.createdAt.desc())
        )
        assert audit.action == "DEPARTMENT_UPDATE"
        assert audit.details == {
            "before": {
                "code": "RENAME",
                "name": "Before",
                "parentId": None,
                "headEmployeeId": None,
                "isActive": True,
            },
            "after": {
                "code": "RENAME",
                "name": "After",
                "parentId": None,
                "headEmployeeId": None,
                "isActive": True,
            },
        }

    original_append = SqlAlchemyAuditRepository.append

    async def append_then_fail(repository, record):
        await original_append(repository, record)
        raise RuntimeError("organization injected failure after audit append")

    monkeypatch.setattr(SqlAlchemyAuditRepository, "append", append_then_fail)
    with pytest.raises(RuntimeError, match="injected failure"):
        await env["departments"].update(
            department["id"], DepartmentCommand(name="Rolled back"), context
        )
    monkeypatch.setattr(SqlAlchemyAuditRepository, "append", original_append)
    async with env["sessions"]() as session:
        assert (
            await session.scalar(select(Department.name).where(Department.id == department["id"]))
            == "After"
        )
        assert (
            await session.scalar(select(Employee.department).where(Employee.id == employee_id))
            == "After"
        )
        assert (
            await session.scalar(
                select(StaffSchedule.department).where(StaffSchedule.id == schedule_id)
            )
            == "After"
        )
        assert await session.scalar(select(Mol.department).where(Mol.id == mol["id"])) == "After"
        assert (
            await session.scalar(
                select(func.count())
                .select_from(AuditLog)
                .where(
                    AuditLog.action == "DEPARTMENT_UPDATE",
                    AuditLog.entityId == department["id"],
                )
            )
            == 1
        )


@pytest.mark.anyio
async def test_advisory_lock_serializes_concurrent_parent_changes(organization_env):
    env = organization_env
    service = env["departments"]
    left = wire(await service.create(DepartmentCommand(code="left", name="Left"), env["context"]))
    right = wire(
        await service.create(DepartmentCommand(code="right", name="Right"), env["context"])
    )
    env["department_ids"].extend((left["id"], right["id"]))
    operations = (
        service.update(
            left["id"],
            DepartmentCommand(parent_id=right["id"], parent_id_set=True),
            env["context"],
        ),
        service.update(
            right["id"],
            DepartmentCommand(parent_id=left["id"], parent_id_set=True),
            env["context"],
        ),
    )
    results = await asyncio.gather(*operations, return_exceptions=True)
    assert sum(not isinstance(result, DomainError) for result in results) == 1
    failures = [result for result in results if isinstance(result, DomainError)]
    assert len(failures) == 1 and failures[0].code == "CYCLIC_HIERARCHY"


@pytest.mark.anyio
async def test_department_mutation_rechecks_actor_under_user_row_lock(
    organization_env, monkeypatch
):
    env = organization_env
    actor = env["actor"]
    service = env["departments"]
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
            service.create(
                DepartmentCommand(code="stale-actor", name="Must roll back"), env["context"]
            )
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
                select(func.count()).select_from(Department).where(Department.code == "STALE-ACTOR")
            )
            == 0
        )
