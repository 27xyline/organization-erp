from decimal import Decimal

from app.domain.finance.payroll_calculator import calculate_payroll


def test_payroll_golden_fixture_rounds_tax_and_contributions_half_up() -> None:
    result = calculate_payroll(
        planned_base=Decimal("100000.00"),
        planned_allowance=Decimal("1000.00"),
        actual_base=Decimal("100000.00"),
        allowance=Decimal("100.00"),
        bonus=Decimal("0.05"),
        one_time=Decimal("0"),
        deduction=Decimal("0"),
    )

    assert result.planned_gross == Decimal("101000.00")
    assert result.gross == Decimal("100100.05")
    assert result.tax == Decimal("13013.01")
    assert result.contributions == Decimal("30030.02")
    assert result.payable == Decimal("87087.04")
    assert result.employer_cost == Decimal("130130.07")
    assert result.variance == Decimal("-899.95")


def test_payroll_gross_is_not_negative() -> None:
    result = calculate_payroll(
        planned_base=Decimal("0"),
        planned_allowance=Decimal("0"),
        actual_base=Decimal("1"),
        allowance=Decimal("0"),
        bonus=Decimal("0"),
        one_time=Decimal("0"),
        deduction=Decimal("2"),
    )

    assert result.gross == Decimal("0.00")
    assert result.tax == Decimal("0.00")
