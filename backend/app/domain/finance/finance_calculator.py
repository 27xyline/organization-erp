from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")
TENTH = Decimal("0.1")


def round_money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def round_tenth(value: Decimal) -> Decimal:
    return value.quantize(TENTH, rounding=ROUND_HALF_UP)


@dataclass(frozen=True, slots=True)
class PlanFactComparison:
    planned: Decimal
    actual: Decimal
    deviation: Decimal
    deviation_percent: Decimal
    status: str


@dataclass(frozen=True, slots=True)
class ProfitabilityForecast:
    planned_profit: Decimal
    actual_profit: Decimal
    planned_profitability_percent: Decimal
    actual_profitability_percent: Decimal
    deviation_percent: Decimal


def compare_plan_fact(planned: Decimal, actual: Decimal) -> PlanFactComparison:
    deviation = actual - planned
    deviation_percent = (deviation / planned * 100) if planned > 0 else Decimal("0")
    status = "ON_BUDGET"
    if deviation > Decimal("0.01"):
        status = "OVER_BUDGET"
    elif deviation < Decimal("-0.01"):
        status = "UNDER_BUDGET"
    return PlanFactComparison(
        round_money(planned),
        round_money(actual),
        round_money(deviation),
        round_tenth(deviation_percent),
        status,
    )


def calculate_profitability_forecast(
    *,
    planned_revenue: Decimal,
    actual_revenue: Decimal,
    planned_costs: Decimal,
    actual_costs: Decimal,
) -> ProfitabilityForecast:
    planned_profit = planned_revenue - planned_costs
    actual_profit = actual_revenue - actual_costs
    planned_percent = planned_profit / planned_revenue * 100 if planned_revenue > 0 else Decimal(0)
    actual_percent = actual_profit / actual_revenue * 100 if actual_revenue > 0 else Decimal(0)
    return ProfitabilityForecast(
        round_money(planned_profit),
        round_money(actual_profit),
        round_tenth(planned_percent),
        round_tenth(actual_percent),
        round_tenth(actual_percent - planned_percent),
    )
