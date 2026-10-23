from decimal import Decimal

from app.domain.timekeeping.labor_calculator import calculate_labor_amounts, standard_monthly_hours


def test_labor_golden_fixture_uses_decimal_rounding() -> None:
    result = calculate_labor_amounts(
        base_salary=Decimal("120000.00"),
        normative_hours=Decimal("160"),
        paid_hours=Decimal("120"),
        overtime_hours=Decimal("1.25"),
        project_hours=Decimal("10.5"),
        project_overtime_hours=Decimal("0.75"),
    )

    assert result.calculated_salary == Decimal("91406.25")
    assert result.project_cost == Decimal("8718.75")


def test_standard_hours_respect_calendar_month_boundaries() -> None:
    assert standard_monthly_hours(2024, 2) == 168
    assert standard_monthly_hours(2024, 3) == 168


def test_nonpositive_normative_hours_return_zero() -> None:
    result = calculate_labor_amounts(
        base_salary=Decimal("100000"),
        normative_hours=Decimal("0"),
        paid_hours=Decimal("40"),
        overtime_hours=Decimal("2"),
        project_hours=Decimal("3"),
        project_overtime_hours=Decimal("1"),
    )

    assert result.calculated_salary == Decimal("0.00")
    assert result.project_cost == Decimal("0.00")
