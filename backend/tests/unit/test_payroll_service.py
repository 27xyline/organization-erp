from __future__ import annotations

import pytest

from app.core.context import RequestContext
from app.domain.errors import DomainError
from app.integrations.payroll_export import OpenpyxlPayrollWorkbook
from app.services.payroll import PayrollService


@pytest.mark.anyio
async def test_payroll_month_rejects_missing_actor_before_opening_uow() -> None:
    service = PayrollService(
        lambda: pytest.fail("UoW must not open for unauthenticated context"),
        OpenpyxlPayrollWorkbook(),
    )

    with pytest.raises(DomainError) as rejected:
        await service.get_month(2026, 10, RequestContext(request_id="s10-unauth-payroll"))

    assert rejected.value.code == "UNAUTHENTICATED"
