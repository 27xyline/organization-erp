from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")
PERSONAL_INCOME_TAX_RATE = Decimal("0.13")
EMPLOYER_CONTRIBUTION_RATE = Decimal("0.30")


def money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass(frozen=True, slots=True)
class PayrollAmounts:
    planned_gross: Decimal
    gross: Decimal
    tax: Decimal
    contributions: Decimal
    payable: Decimal
    employer_cost: Decimal
    variance: Decimal


def calculate_payroll(
    *,
    planned_base: Decimal,
    planned_allowance: Decimal,
    actual_base: Decimal,
    allowance: Decimal,
    bonus: Decimal,
    one_time: Decimal,
    deduction: Decimal,
) -> PayrollAmounts:
    planned = planned_base + planned_allowance
    gross = max(Decimal("0"), actual_base + allowance + bonus + one_time - deduction)
    tax = money(gross * PERSONAL_INCOME_TAX_RATE)
    contributions = money(gross * EMPLOYER_CONTRIBUTION_RATE)
    return PayrollAmounts(
        planned_gross=money(planned),
        gross=money(gross),
        tax=tax,
        contributions=contributions,
        payable=money(gross - tax),
        employer_cost=money(gross + contributions),
        variance=money(gross - planned),
    )
