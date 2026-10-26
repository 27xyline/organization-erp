from decimal import Decimal

import pytest

from app.domain.finance.finance_plan_rules import (
    calculate_budget_adjustments,
    normalize_allocations,
)


def test_duplicate_allocations_are_aggregated_with_decimal_precision() -> None:
    assert normalize_allocations(
        "NADBAVKA",
        employee_salary=Decimal("0"),
        employee_rate=Decimal("0"),
        allocations=(("p1", "100"), ("p1", "50.5"), ("p2", "25,25")),
    ) == (("p1", Decimal("150.50")), ("p2", Decimal("25.25")))


def test_oklad_requires_project_and_positive_computed_amount() -> None:
    with pytest.raises(ValueError, match="PROJECT_REQUIRED"):
        normalize_allocations("OKLAD", employee_salary=Decimal("1000"), employee_rate=Decimal("1"))
    with pytest.raises(ValueError, match="INVALID_OKLAD_AMOUNT"):
        normalize_allocations(
            "OKLAD", employee_salary=Decimal("0"), employee_rate=Decimal("1"), project_id="p1"
        )


def test_adjustments_reconcile_replaced_allocations_by_project() -> None:
    decrements, increments = calculate_budget_adjustments(
        (("p1", Decimal("100")), ("p2", Decimal("50"))),
        (("p1", Decimal("70")), ("p3", Decimal("30"))),
    )
    assert decrements == {"p1": Decimal("30.00"), "p2": Decimal("50.00")}
    assert increments == {"p3": Decimal("30.00")}
