from __future__ import annotations

from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.payroll import PayrollAdjustmentInput, PayrollMonthQuery, PayrollPeriodInput


def test_payroll_query_and_adjustment_keep_legacy_camel_case_contract() -> None:
    query = PayrollMonthQuery(year="2026", month="10")
    assert query.model_dump() == {"year": 2026, "month": 10}
    adjustment = PayrollAdjustmentInput(
        employeeId=f"c{'1' * 24}",
        projectId=None,
        year=2026,
        month=10,
        type="BONUS",
        amount="125.50",
        description="  Annual bonus  ",
    )
    assert adjustment.amount == Decimal("125.50")
    assert adjustment.description == "Annual bonus"
    assert adjustment.projectId is None


@pytest.mark.parametrize(
    "payload",
    [
        {
            "employeeId": f"c{'2' * 24}",
            "year": 2026,
            "month": 13,
            "type": "BONUS",
            "amount": 1,
            "description": "Valid bonus",
        },
        {
            "employeeId": f"c{'2' * 24}",
            "year": 2026,
            "month": 1,
            "type": "OTHER",
            "amount": 1,
            "description": "Valid bonus",
        },
        {
            "employeeId": f"c{'2' * 24}",
            "year": 2026,
            "month": 1,
            "type": "BONUS",
            "amount": 0,
            "description": "Valid bonus",
        },
        {
            "employeeId": "not-cuid",
            "year": 2026,
            "month": 1,
            "type": "BONUS",
            "amount": 1,
            "description": "Valid bonus",
        },
        {
            "employeeId": f"c{'2' * 24}",
            "year": 2026,
            "month": 1,
            "type": "BONUS",
            "amount": 1,
            "description": " x ",
        },
    ],
)
def test_payroll_adjustment_rejects_invalid_legacy_inputs(payload: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        PayrollAdjustmentInput(**payload)


def test_reopen_reason_is_trimmed_and_required_only_by_period_service() -> None:
    value = PayrollPeriodInput(year=2026, month=10, status="OPEN", reason="  reopen  ")
    assert value.reason == "reopen"
