from datetime import date

from app.domain.timekeeping.rules import payroll_period_keys


def test_period_keys_are_unique_and_sorted_for_cross_month_entry_edit() -> None:
    assert payroll_period_keys(date(2026, 2, 1), date(2026, 1, 31)) == ((2026, 1), (2026, 2))
