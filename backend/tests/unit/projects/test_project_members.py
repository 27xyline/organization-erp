from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.core.context import Actor, RequestContext
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.services import project_members as project_members_module
from app.services.project_members import ProjectMemberService


@pytest.mark.anyio
async def test_add_gates_payroll_snapshot_before_project_lock_and_employee_read(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[str] = []

    async def lock_project(uow, project_id, actor) -> None:
        events.append("project-lock")

    monkeypatch.setattr(project_members_module, "lock_project", lock_project)

    class PayrollInputLock:
        async def lock_shared(self) -> None:
            events.append("shared-gate")

    class Employees:
        async def get(self, employee_id: str):
            events.append("employee-read")
            return SimpleNamespace(
                status="ACTIVE",
                department="Engineering",
                employmentRate=Decimal("0.5"),
                staffSchedule=SimpleNamespace(
                    department="Engineering",
                    position="Developer",
                    salary=Decimal("50000"),
                ),
            )

    class Projects:
        async def add_member(self, project_id, employee_id, values):
            events.append("member-write")
            assert values["salary"] == Decimal("25000.00")
            return "member-record"

    class Uow:
        payroll_input_lock = PayrollInputLock()
        employees = Employees()
        projects = Projects()

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def commit(self) -> None:
            events.append("commit")

    access = AccessContext(
        user_id="actor",
        employee_id=None,
        employee_department_id=None,
        member_project_ids=(),
        grants=(ScopeGrant("grant", "ADMIN", "ALL", "ALL"),),
    )
    actor = Actor(actor_id="actor", is_authenticated=True, access=access)
    context = RequestContext(request_id="project-member-gate", actor=actor)
    service = ProjectMemberService(lambda: Uow())

    await service.add("project-1", "employee-1", context)

    assert events == ["shared-gate", "project-lock", "employee-read", "member-write", "commit"]
