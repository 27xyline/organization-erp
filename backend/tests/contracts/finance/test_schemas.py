import pytest
from pydantic import ValidationError

from app.schemas.finance import PayrollPeriodInput
from app.schemas.finance_workflows import (
    FinancePlanSaveInput,
    ProjectPayrollSaveInput,
)


def test_payroll_period_schema_keeps_camel_case_and_legacy_number_coercion() -> None:
    value = PayrollPeriodInput.model_validate({"year": "2026", "month": "2", "status": "CLOSED"})

    assert value.year == 2026
    assert value.month == 2
    assert value.status == "CLOSED"


def test_payroll_period_schema_rejects_invalid_month() -> None:
    with pytest.raises(ValidationError):
        PayrollPeriodInput.model_validate({"year": 2026, "month": 13, "status": "OPEN"})


def test_finance_workflow_schemas_keep_legacy_camel_case_and_decimal_strings() -> None:
    plan = FinancePlanSaveInput.model_validate(
        {
            "year": 2026,
            "month": 3,
            "type": "nadbavka",
            "employeeId": "employee-1",
            "allocations": [{"projectId": "project-1", "amount": "100,25"}],
        }
    )
    project_payroll = ProjectPayrollSaveInput.model_validate(
        {
            "year": 2026,
            "month": 3,
            "employeeId": "employee-1",
            "okladEnabled": True,
            "nadbavkaAmount": "75.10",
        }
    )

    assert plan.allocations[0].amount == "100,25"
    assert project_payroll.nadbavkaAmount == "75.10"


def test_finance_workflow_schemas_reject_out_of_range_periods() -> None:
    with pytest.raises(ValidationError):
        ProjectPayrollSaveInput.model_validate(
            {
                "year": 2026,
                "month": 13,
                "employeeId": "employee-1",
                "okladEnabled": False,
            }
        )
