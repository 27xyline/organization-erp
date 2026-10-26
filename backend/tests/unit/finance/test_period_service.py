from __future__ import annotations

import pytest

from app.core.context import Actor, RequestContext
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.services.finance_periods import PayrollPeriodService


class _Periods:
    changed = True

    async def set_status(
        self, year: int, month: int, status: str, actor_id: str, reason: str | None = None
    ):
        return {
            "id": "period-1",
            "year": year,
            "month": month,
            "status": status,
            "_changed": self.changed,
        }


class _Audit:
    def __init__(self) -> None:
        self.records = []

    async def append(self, record) -> None:
        self.records.append(record)


class _Uow:
    def __init__(self) -> None:
        self.payroll_periods = _Periods()
        self.audit = _Audit()
        self.committed = False

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def commit(self) -> None:
        self.committed = True


def _context() -> RequestContext:
    access = AccessContext(
        user_id="user-1",
        employee_id=None,
        employee_department_id=None,
        member_project_ids=(),
        grants=(ScopeGrant("grant-1", "ADMIN", "ALL", "ALL"),),
    )
    actor = Actor("user-1", roles=("ADMIN",), is_authenticated=True, access=access)
    return RequestContext("req-1", actor=actor)


@pytest.mark.anyio
async def test_set_period_status_commits_period_and_audit_in_same_uow() -> None:
    uow = _Uow()
    service = PayrollPeriodService(lambda: uow)

    result = await service.set_status(2026, 2, "CLOSED", _context())

    assert result == {"id": "period-1", "year": 2026, "month": 2, "status": "CLOSED"}
    assert uow.committed
    assert uow.audit.records[0].action == "PAYROLL_PERIOD_CLOSE"


@pytest.mark.anyio
async def test_idempotent_period_status_does_not_append_audit() -> None:
    uow = _Uow()
    uow.payroll_periods.changed = False

    result = await PayrollPeriodService(lambda: uow).set_status(2026, 2, "CLOSED", _context())

    assert "_changed" not in result
    assert not uow.audit.records
    assert uow.committed
