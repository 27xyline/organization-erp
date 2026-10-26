from __future__ import annotations

from calendar import monthrange
from datetime import date
from decimal import Decimal


def month_bounds(year: int, month: int) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
    "Вернуть включительную начальную и исключительную конечную даты календарного месяца."
    if not 1 <= month <= 12:
        raise ValueError("month must be between 1 and 12")
    monthrange(year, month)  # Проверить год и месяц по тем же календарным правилам, что и datetime.
    if month == 12:
        return (year, month, 1), (year + 1, 1, 1)
    return (year, month, 1), (year, month + 1, 1)


def validate_daily_hours(existing_hours: Decimal, new_hours: Decimal) -> bool:
    return existing_hours + new_hours <= Decimal("24")


def payroll_period_keys(*dates: date) -> tuple[tuple[int, int], ...]:
    "Вернуть уникальные расчётные периоды в глобальном порядке захвата блокировок."
    return tuple(sorted({(value.year, value.month) for value in dates}))
