from decimal import Decimal

import pytest

from app.domain.timekeeping.rules import month_bounds, validate_daily_hours


def test_month_bounds_are_inclusive_start_and_exclusive_next_month() -> None:
    assert month_bounds(2024, 2) == ((2024, 2, 1), (2024, 3, 1))
    assert month_bounds(2024, 12) == ((2024, 12, 1), (2025, 1, 1))


def test_month_bounds_reject_invalid_month() -> None:
    with pytest.raises(ValueError, match="month"):
        month_bounds(2024, 13)


def test_daily_limit_allows_exactly_24_hours_only() -> None:
    assert validate_daily_hours(Decimal("16"), Decimal("8"))
    assert not validate_daily_hours(Decimal("16"), Decimal("8.01"))
