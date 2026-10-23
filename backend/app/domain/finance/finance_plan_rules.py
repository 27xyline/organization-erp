from __future__ import annotations

import re
from collections.abc import Iterable
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

CENT = Decimal("0.01")
_AMOUNT_PATTERN = re.compile(r"^\d+(?:\.\d{1,2})?$")


def _normalize_amount(value: str) -> Decimal | None:
    normalized = value.replace(",", ".").strip()
    if not _AMOUNT_PATTERN.fullmatch(normalized):
        return None
    try:
        amount = Decimal(normalized).quantize(CENT, rounding=ROUND_HALF_UP)
    except InvalidOperation:
        return None
    return amount if amount > 0 else None


def normalize_allocations(
    plan_type: str,
    *,
    employee_salary: Decimal,
    employee_rate: Decimal,
    project_id: str | None = None,
    allocations: Iterable[tuple[str | None, str]] = (),
) -> tuple[tuple[str, Decimal], ...]:
    if plan_type == "OKLAD":
        if not project_id:
            raise ValueError("PROJECT_REQUIRED")
        amount = (employee_salary * employee_rate).quantize(CENT, rounding=ROUND_HALF_UP)
        if amount <= 0:
            raise ValueError("INVALID_OKLAD_AMOUNT")
        return ((project_id, amount),)
    if plan_type != "NADBAVKA":
        raise ValueError("INVALID_FINANCE_PLAN_TYPE")

    totals: dict[str, Decimal] = {}
    found = False
    for allocation_project_id, raw_amount in allocations:
        found = True
        if not allocation_project_id:
            raise ValueError("PROJECT_REQUIRED")
        parsed_amount = _normalize_amount(raw_amount)
        if parsed_amount is None:
            raise ValueError("INVALID_FINANCE_AMOUNT")
        totals[allocation_project_id] = (
            totals.get(allocation_project_id, Decimal(0)) + parsed_amount
        )
    if not found:
        raise ValueError("INVALID_ALLOCATIONS")
    return tuple((identifier, amount.quantize(CENT)) for identifier, amount in totals.items())


def calculate_budget_adjustments(
    existing: Iterable[tuple[str | None, Decimal]],
    next_allocations: Iterable[tuple[str, Decimal]],
) -> tuple[dict[str, Decimal], dict[str, Decimal]]:
    deltas: dict[str, Decimal] = {}
    for project_id, amount in existing:
        if project_id:
            deltas[project_id] = deltas.get(project_id, Decimal(0)) - amount
    for project_id, amount in next_allocations:
        deltas[project_id] = deltas.get(project_id, Decimal(0)) + amount

    decrements: dict[str, Decimal] = {}
    increments: dict[str, Decimal] = {}
    for project_id, delta in deltas.items():
        rounded = delta.quantize(CENT, rounding=ROUND_HALF_UP)
        if rounded > 0:
            increments[project_id] = rounded
        elif rounded < 0:
            decrements[project_id] = abs(rounded)
    return decrements, increments
