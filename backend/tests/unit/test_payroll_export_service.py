from __future__ import annotations

import asyncio

import pytest

from app.core.context import Actor, RequestContext
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.domain.errors import DomainError
from app.services import payroll as payroll_module
from app.services.payroll import PayrollService


def _context() -> RequestContext:
    access = AccessContext(
        user_id="s10-exporter",
        employee_id=None,
        employee_department_id=None,
        member_project_ids=(),
        grants=(ScopeGrant("s10-grant", "ADMIN", "ALL", "ALL"),),
    )
    return RequestContext(
        request_id="s10-export-service",
        actor=Actor(actor_id="s10-exporter", is_authenticated=True, access=access),
    )


def _row(employee_id: str = "c123") -> dict[str, object]:
    return {
        "employeeId": employee_id,
        "code": "EMP-123",
        "fullName": "Тестовый Сотрудник",
        "department": "Разработка",
        "position": "Инженер",
        "rate": 1,
        "plannedGross": 100,
        "actualBase": 100,
        "allowance": 0,
        "bonus": 0,
        "oneTime": 0,
        "deduction": 0,
        "gross": 100,
        "tax": 13,
        "payable": 87,
        "contributions": 30,
        "employerCost": 130,
        "variance": 0,
    }


@pytest.mark.anyio
async def test_payroll_renderer_runs_only_after_month_payload_and_uow_return(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class Finance:
        async def employees(self):
            return []

        async def projects_for_plan(self):
            return []

        async def salary_entries(self, year, month, employee_ids):
            return []

        async def plan_entries(self, year, *, employee_ids=None, project_only=False):
            return []

        async def payroll_adjustments(self, year, month, *, employee_ids=None):
            return []

        async def payroll_period(self, year, month):
            return None

    class Uow:
        def __init__(self, factory):
            self.factory = factory
            self.finance = Finance()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc_info):
            self.factory.closed = True

    class Factory:
        closed = False

        def __call__(self):
            return Uow(self)

    factory = Factory()
    service = PayrollService(factory)

    async def to_thread(renderer, *args):
        assert factory.closed, "renderer started while the payroll UoW was still open"
        assert renderer is payroll_module.build_payroll_workbook
        return b"rendered-xlsx"

    monkeypatch.setattr(asyncio, "to_thread", to_thread)

    payload, filename = await service.export_month(2026, 10, _context())

    assert payload == b"rendered-xlsx"
    assert filename == "payroll-2026-10.xlsx"


@pytest.mark.anyio
async def test_payslip_not_found_is_checked_before_renderer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = PayrollService(lambda: pytest.fail("UoW is represented by get_month"))

    async def get_month(year: int, month: int, context: RequestContext, *, permission: str):
        return {"rows": [_row("c111")]}

    async def to_thread(*args):
        pytest.fail("renderer must not run when employee has no row")

    service.get_month = get_month  # type: ignore[method-assign]
    monkeypatch.setattr(asyncio, "to_thread", to_thread)

    with pytest.raises(DomainError) as missing:
        await service.export_payslip(2026, 10, "c999", _context())

    assert missing.value.code == "NOT_FOUND"
    assert missing.value.status_code == 404
