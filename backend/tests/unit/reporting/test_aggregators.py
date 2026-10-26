from decimal import Decimal

from app.domain.reporting.aggregators import (
    WorkforceInput,
    aggregate_workforce,
    page_from_full_scope,
)


def test_page_uses_full_scope_total_after_aggregation_for_more_than_one_hundred_rows() -> None:
    employees = [
        WorkforceInput(
            department_id="dept-1",
            department="Отдел",
            active=index < 105,
            employment_rate=Decimal("0.50"),
            monthly_salary=Decimal("1000.00"),
        )
        for index in range(137)
    ]
    rows, totals = aggregate_workforce(employees, [], [], months=2)
    result = page_from_full_scope(employees, page=2, page_size=50)

    assert totals["headcount"] == 137
    assert totals["active"] == 105
    assert totals["occupied_rate"] == Decimal("68.50")
    assert totals["planned_fot"] == Decimal("274000.00")
    assert result.total == 137
    assert len(result.items) == 50
    assert result.pages == 3
    assert len(rows) == 1


def test_page_rejects_invalid_window() -> None:
    try:
        page_from_full_scope([1], page=0, page_size=10)
    except ValueError as error:
        assert "positive" in str(error)
    else:
        raise AssertionError("invalid page should be rejected")
