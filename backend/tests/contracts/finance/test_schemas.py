import pytest
from pydantic import ValidationError

from app.schemas.finance import PayrollPeriodInput


def test_payroll_period_schema_keeps_camel_case_and_legacy_number_coercion() -> None:
    value = PayrollPeriodInput.model_validate({"year": "2026", "month": "2", "status": "CLOSED"})

    assert value.year == 2026
    assert value.month == 2
    assert value.status == "CLOSED"


def test_payroll_period_schema_rejects_invalid_month() -> None:
    with pytest.raises(ValidationError):
        PayrollPeriodInput.model_validate({"year": 2026, "month": 13, "status": "OPEN"})
