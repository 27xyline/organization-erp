from decimal import Decimal

from app.domain.reporting.aggregators import (
    WorkforceInput,
    aggregate_workforce,
    page_from_full_scope,
)


def test_report_totals_are_aggregated_over_full_scope_before_page_selection() -> None:
    scoped_rows = [
        WorkforceInput(
            department_id="dept-a",
            department="Отдел А",
            active=index < 101,
            employment_rate=Decimal("0.50"),
            monthly_salary=Decimal("1000.00"),
        )
        for index in range(137)
    ]
    aggregates, totals = aggregate_workforce(scoped_rows, [], [], months=1)
    page = page_from_full_scope(scoped_rows, page=2, page_size=50)

    assert totals["headcount"] == 137
    assert totals["active"] == 101
    assert totals["occupied_rate"] == Decimal("68.50")
    assert aggregates[0].planned_fot == Decimal("137000.00")
    assert page.total == 137
    assert len(page.items) == 50
