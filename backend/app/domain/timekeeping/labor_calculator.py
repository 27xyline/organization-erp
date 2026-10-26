from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")
EIGHT_HOURS = Decimal("8")
ONE_POINT_FIVE = Decimal("1.5")


def money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass(frozen=True, slots=True)
class LaborAmounts:
    calculated_salary: Decimal
    project_cost: Decimal


def standard_monthly_hours(year: int, month: int) -> int:
    days = monthrange(year, month)[1]
    weekdays = sum(date(year, month, day).weekday() < 5 for day in range(1, days + 1))
    return weekdays * 8


def calculate_labor_amounts(
    *,
    base_salary: Decimal,
    normative_hours: Decimal,
    paid_hours: Decimal,
    overtime_hours: Decimal,
    project_hours: Decimal,
    project_overtime_hours: Decimal,
) -> LaborAmounts:
    if normative_hours <= 0:
        return LaborAmounts(Decimal("0.00"), Decimal("0.00"))
    hourly_rate = base_salary / normative_hours
    salary = min(paid_hours / normative_hours, Decimal("1")) * base_salary
    salary += overtime_hours * hourly_rate * ONE_POINT_FIVE
    cost = project_hours * hourly_rate + project_overtime_hours * hourly_rate * ONE_POINT_FIVE
    return LaborAmounts(money(salary), money(cost))
