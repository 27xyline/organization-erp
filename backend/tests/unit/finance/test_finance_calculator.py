from decimal import Decimal

from app.domain.finance.finance_calculator import (
    calculate_profitability_forecast,
    compare_plan_fact,
)


def test_plan_fact_golden_fixture_uses_existing_one_kopeck_tolerance() -> None:
    assert compare_plan_fact(Decimal("100.00"), Decimal("100.01")).status == "ON_BUDGET"
    result = compare_plan_fact(Decimal("100.00"), Decimal("110.05"))
    assert result.planned == Decimal("100.00")
    assert result.actual == Decimal("110.05")
    assert result.deviation == Decimal("10.05")
    assert result.deviation_percent == Decimal("10.1")
    assert result.status == "OVER_BUDGET"


def test_profitability_forecast_handles_zero_revenue_and_negative_profit() -> None:
    result = calculate_profitability_forecast(
        planned_revenue=Decimal("0"),
        actual_revenue=Decimal("50"),
        planned_costs=Decimal("10"),
        actual_costs=Decimal("70"),
    )
    assert result.planned_profit == Decimal("-10.00")
    assert result.actual_profit == Decimal("-20.00")
    assert result.planned_profitability_percent == Decimal("0.0")
    assert result.actual_profitability_percent == Decimal("-40.0")
