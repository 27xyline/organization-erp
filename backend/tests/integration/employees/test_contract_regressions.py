"""Воспроизвести сценарий исходной записи TypeScript на отдельной PostgreSQL."""

import json
from dataclasses import replace
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.models.departments import Department
from app.models.finance import PersonnelAction
from app.models.notifications import NotificationOutbox
from app.models.users import AuditLog
from app.services.dto.employees import (
    EmployeeCommand,
    PersonnelActionCommand,
    StaffCommand,
    VacationCommand,
)


@pytest.mark.anyio
async def test_real_legacy_hr_scenario_matches_python_atomic_writes_and_audit(hr_env):
    env = hr_env
    golden = json.loads(
        (Path(__file__).parents[2] / "fixtures/contracts/employees.json").read_text()
    )
    second_department = env["prefix"] + "-department-b"
    async with env["sessions"]() as session:
        session.add(
            Department(id=second_department, code=second_department, name=second_department)
        )
        await session.commit()
    a = await env["workforce"].save_position(
        None,
        StaffCommand(
            "position-a", Decimal("2"), Decimal("100000"), departmentId=env["department_id"]
        ),
        env["context"],
    )
    b = await env["workforce"].save_position(
        None,
        StaffCommand("position-b", Decimal("2"), Decimal("120000"), departmentId=second_department),
        env["context"],
    )
    command = EmployeeCommand(
        code=env["prefix"],
        fullName="Parity Worker",
        staffScheduleId=a.id,
        employmentRate=Decimal(1),
        contractNumber="42",
        contractSignedDate="2026-01-01",
        contractEndDate="2026-12-31",
    )
    employee = await env["employees"].create(command, env["context"])
    await env["actions"].create(
        PersonnelActionCommand(
            "EXTEND", "2026-01-10", employeeId=employee.id, newContractEndDate="2027-12-31"
        ),
        env["context"],
    )
    await env["actions"].create(
        PersonnelActionCommand(
            "TRANSFER", "2026-02-01", employeeId=employee.id, staffScheduleId=b.id
        ),
        env["context"],
    )
    await env["workforce"].save_vacation(
        None, VacationCommand(employee.id, "2026-02-10", "2026-02-12"), env["context"]
    )
    await env["actions"].create(
        PersonnelActionCommand("DISMISS", "2026-03-01", employeeId=employee.id), env["context"]
    )
    expired = await env["employees"].create(
        replace(
            command,
            code=env["prefix"] + "-expired",
            contractSignedDate="2020-01-01",
            contractEndDate="2020-12-31",
        ),
        env["context"],
    )
    first = await env["actions"].sync(env["context"])
    second = await env["actions"].sync(env["context"])
    async with env["factory"]() as uow:
        current = await uow.employees.get(employee.id)
        vacations = await uow.workforce.vacations(2026, env["actor"].access)
    async with env["sessions"]() as session:
        actions = (
            await session.scalars(
                select(PersonnelAction)
                .where(PersonnelAction.employeeId == employee.id)
                .order_by(PersonnelAction.date)
            )
        ).all()
        action_counts = dict(
            (
                await session.execute(
                    select(AuditLog.action, func.count())
                    .where(AuditLog.userId == env["user_id"])
                    .group_by(AuditLog.action)
                )
            ).all()
        )
        archives = await session.scalar(
            select(func.count())
            .select_from(PersonnelAction)
            .where(PersonnelAction.employeeId == expired.id, PersonnelAction.type == "ARCHIVE")
        )
        outbox = await session.scalar(select(func.count()).select_from(NotificationOutbox))
    actual = {
        "fixture": golden["fixture"],
        "scenario": golden["scenario"],
        "employee": {
            "status": current.status,
            "department": "department-b"
            if current.departmentId == second_department
            else "department-a",
            "position": current.staffSchedule.position,
            "contractEndDate": current.contractEndDate.isoformat(timespec="milliseconds") + "Z",
            "vacationCount": len([row for row in vacations if row.employeeId == employee.id]),
        },
        "actions": [
            {
                "type": row.type,
                "date": row.date.date().isoformat(),
                "newContractEndDate": row.newContractEndDate.date().isoformat()
                if row.newContractEndDate
                else None,
            }
            for row in actions
        ],
        "sync": {"firstCount": first, "secondCount": second, "expiredArchiveCount": archives},
        "auditActionCounts": action_counts,
        "notificationOutboxCount": outbox,
    }
    assert actual == golden
