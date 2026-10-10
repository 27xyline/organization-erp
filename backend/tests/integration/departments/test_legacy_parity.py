"""Compare the migrated use cases and audits with the captured legacy baseline."""

import json
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.context import RequestContext
from app.domain.errors import DomainError
from app.models.catalogs import Mol
from app.models.employees import Employee
from app.models.enums import EmployeeStatus
from app.models.timekeeping import StaffSchedule
from app.models.users import AuditLog
from app.services.dto.catalogs import GroupCommand, MolCommand
from app.services.dto.departments import DepartmentCommand
from tests.stage04_support import wire

FIXTURE = Path(__file__).parents[2] / "contracts/fixtures/stage04-legacy-parity.json"


@pytest.mark.anyio
async def test_department_and_catalog_behavior_matches_live_legacy_fixture(organization_env):
    env = organization_env
    expected = json.loads(FIXTURE.read_text(encoding="utf-8"))
    department_data = expected["departmentCreate"]
    department_command = DepartmentCommand(
        code=department_data["code"],
        name=department_data["name"],
        parent_id=department_data["parentId"],
        head_employee_id=department_data["headEmployeeId"],
        is_active=department_data["isActive"],
    )
    department = wire(
        await env["departments"].create(
            department_command,
            RequestContext("stage04-legacy-create", actor=env["actor"]),
        )
    )
    env["department_ids"].append(department["id"])
    assert {key: department[key] for key in department_data} == department_data

    with pytest.raises(DomainError) as duplicate_department:
        await env["departments"].create(
            DepartmentCommand(code=department_data["code"], name="Duplicate"),
            RequestContext("stage04-legacy-duplicate", actor=env["actor"]),
        )
    assert duplicate_department.value.code == expected["departmentDuplicateCodeError"]

    employee_id = env["prefix"] + "-parity-employee"
    schedule_id = env["prefix"] + "-parity-schedule"
    env["employee_ids"].append(employee_id)
    env["staff_schedule_ids"].append(schedule_id)
    async with env["sessions"]() as session:
        session.add(
            Employee(
                id=employee_id,
                code=employee_id,
                fullName="Synthetic Employee",
                department=department["name"],
                departmentId=department["id"],
                status=EmployeeStatus.ACTIVE,
            )
        )
        session.add(
            StaffSchedule(
                id=schedule_id,
                position="Synthetic position",
                department=department["name"],
                departmentId=department["id"],
                rate=Decimal("1.00"),
                salary=Decimal("1000.00"),
            )
        )
        await session.commit()

    mol_data = dict(expected["molCreate"])
    mol_data["departmentId"] = department["id"]
    mol_data["storageLocation"] = "Synthetic room 1"
    mol = wire(
        await env["catalogs"].create_mol(
            MolCommand(
                code=mol_data["code"],
                department_id=mol_data["departmentId"],
                department=mol_data["department"],
                full_name=mol_data["fullName"],
                storage_location=mol_data["storageLocation"],
                photo=mol_data["photo"],
                present_fields=frozenset(
                    {
                        "code",
                        "department_id",
                        "department",
                        "full_name",
                        "storage_location",
                        "photo",
                    }
                ),
            ),
            RequestContext("stage04-legacy-mol-create", actor=env["actor"]),
        )
    )
    env["mol_ids"].append(mol["id"])
    with pytest.raises(DomainError) as duplicate_mol:
        await env["catalogs"].create_mol(
            MolCommand(
                code=mol_data["code"],
                department_id=mol_data["departmentId"],
                department=mol_data["department"],
                full_name=mol_data["fullName"],
                storage_location=mol_data["storageLocation"],
                photo=mol_data["photo"],
                present_fields=frozenset(
                    {
                        "code",
                        "department_id",
                        "department",
                        "full_name",
                        "storage_location",
                        "photo",
                    }
                ),
            ),
            RequestContext("stage04-legacy-mol-duplicate", actor=env["actor"]),
        )
    assert duplicate_mol.value.code == expected["molDuplicateCodeError"]

    rename = expected["departmentRename"]["name"]
    department = wire(
        await env["departments"].update(
            department["id"],
            DepartmentCommand(name=rename),
            RequestContext("stage04-legacy-rename", actor=env["actor"]),
        )
    )
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
    assert list(snapshots) == expected["departmentRename"]["denormalizedDepartmentNames"]

    group_data = expected["groupCrud"]["create"]
    group = wire(
        await env["catalogs"].create_group(
            GroupCommand(**group_data, present_fields=frozenset(group_data)),
            RequestContext("stage04-legacy-group-create", actor=env["actor"]),
        )
    )
    env["group_ids"].append(group["id"])
    with pytest.raises(DomainError) as duplicate_group:
        await env["catalogs"].create_group(
            GroupCommand(**group_data, present_fields=frozenset(group_data)),
            RequestContext("stage04-legacy-group-duplicate", actor=env["actor"]),
        )
    assert duplicate_group.value.code == expected["groupCrud"]["duplicateCodeError"]
    group_update = expected["groupCrud"]["update"]
    group = wire(
        await env["catalogs"].update_group(
            group["id"],
            GroupCommand(**group_update, present_fields=frozenset(group_update)),
            RequestContext("stage04-legacy-group-update", actor=env["actor"]),
        )
    )
    assert group["description"] == group_update["description"]
    assert [row.code for row in await env["catalogs"].list_groups(env["actor"])] == [
        group_update["code"]
    ]
    assert (await env["catalogs"].get_group(group["id"], env["actor"])).assets == expected[
        "groupCrud"
    ]["getCount"]
    assert (
        await env["catalogs"].delete_group(
            group["id"], RequestContext("stage04-legacy-group-delete", actor=env["actor"])
        )
        == expected["groupDelete"]
    )

    mol_update = expected["molUpdate"]
    mol_update_data = {
        "code": mol_update["code"],
        "fullName": mol_update["fullName"],
        "departmentId": department["id"],
        "department": department["name"],
        "storageLocation": mol_update["storageLocation"],
        "photo": mol_update["photo"],
    }
    mol = wire(
        await env["catalogs"].update_mol(
            mol["id"],
            MolCommand(
                code=mol_update_data["code"],
                department_id=mol_update_data["departmentId"],
                department=mol_update_data["department"],
                full_name=mol_update_data["fullName"],
                storage_location=mol_update_data["storageLocation"],
                photo=mol_update_data["photo"],
                present_fields=frozenset(
                    {
                        "code",
                        "department_id",
                        "department",
                        "full_name",
                        "storage_location",
                        "photo",
                    }
                ),
            ),
            RequestContext("stage04-legacy-mol-update", actor=env["actor"]),
        )
    )
    assert mol["department"] == mol_update["department"]
    mol_usage = await env["catalogs"].get_mol(mol["id"], env["actor"])
    assert (mol_usage.holdings, mol_usage.assets) == (0, mol_update["getCount"])
    assert (
        await env["catalogs"].delete_mol(
            mol["id"], RequestContext("stage04-legacy-mol-delete", actor=env["actor"])
        )
        == expected["molDelete"]
    )
    async with env["sessions"]() as session:
        await session.execute(Employee.__table__.delete().where(Employee.id == employee_id))
        await session.execute(
            StaffSchedule.__table__.delete().where(StaffSchedule.id == schedule_id)
        )
        await session.commit()
    assert (
        await env["departments"].delete(
            department["id"], RequestContext("stage04-legacy-department-delete", actor=env["actor"])
        )
        == expected["departmentDelete"]
    )

    request_ids = {event["requestId"] for event in expected["audit"]}
    async with env["sessions"]() as session:
        events = list(
            await session.scalars(
                select(AuditLog)
                .where(AuditLog.requestId.in_(request_ids))
                .order_by(AuditLog.createdAt.asc())
            )
        )

    aliases = {
        department["id"]: "department-1",
        mol["id"]: "mol-1",
        group["id"]: "group-1",
    }

    def normalize_ids(value):
        if isinstance(value, dict):
            return {key: normalize_ids(item) for key, item in value.items()}
        if isinstance(value, list):
            return [normalize_ids(item) for item in value]
        return aliases.get(value, value) if isinstance(value, str) else value

    actual_audit = [
        {
            "action": event.action,
            "entityType": event.entityType,
            "entityId": aliases[event.entityId],
            "details": normalize_ids(event.details),
            "requestId": event.requestId,
        }
        for event in events
    ]
    assert actual_audit == expected["audit"]
