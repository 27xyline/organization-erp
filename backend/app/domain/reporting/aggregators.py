"""Pure helpers shared by report and dashboard use cases."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any


@dataclass(frozen=True, slots=True)
class Page[T]:
    items: tuple[T, ...]
    page: int
    page_size: int
    total: int

    @property
    def pages(self) -> int:
        return (self.total + self.page_size - 1) // self.page_size


def page_from_full_scope[T](rows: Sequence[T], page: int, page_size: int) -> Page[T]:
    """Slice an already scoped result while retaining its full-scope total."""
    if page < 1 or page_size < 1:
        raise ValueError("page and page_size must be positive")
    start = (page - 1) * page_size
    return Page(tuple(rows[start : start + page_size]), page, page_size, len(rows))


def percent(value: int | float | Decimal, total: int | float | Decimal) -> float:
    return round(float(value) / float(total) * 1000) / 10 if total > 0 else 0.0


def months_in_period(date_from: date, date_to: date) -> int:
    """Count inclusive calendar months."""
    return max(1, (date_to.year - date_from.year) * 12 + date_to.month - date_from.month + 1)


def aggregate_projects(projects: Sequence[Mapping[str, Any]]) -> dict[str, float | int]:
    planned = sum(float(project["plannedBudget"]) for project in projects)
    actual = sum(float(project["actualBudget"]) for project in projects)
    progress = sum(int(str(project["progress"])) for project in projects)
    return {
        "count": len(projects),
        "plannedBudget": planned,
        "actualBudget": actual,
        "variance": actual - planned,
        "budgetUsage": percent(actual, planned),
        "averageProgress": round(progress / len(projects)) if projects else 0,
    }


def aggregate_assets(assets: Sequence[Mapping[str, Any]]) -> dict[str, object]:
    grouped: dict[str, dict[str, object]] = {}
    value = 0.0
    for asset in assets:
        status, cost = str(asset["status"]), float(str(asset["totalCost"]))
        value += cost
        row = grouped.setdefault(status, {"status": status, "count": 0, "value": 0.0})
        row["count"] = int(str(row["count"])) + 1
        row["value"] = float(str(row["value"])) + cost
    return {
        "count": len(assets),
        "value": value,
        "byStatus": sorted(grouped.values(), key=lambda row: -float(str(row["value"]))),
    }


def aggregate_vacations(types: Sequence[str]) -> list[dict[str, object]]:
    grouped: dict[str, int] = {}
    for kind in types:
        grouped[kind] = grouped.get(kind, 0) + 1
    return [
        {"type": kind, "count": count}
        for kind, count in sorted(grouped.items(), key=lambda item: -item[1])
    ]


@dataclass(frozen=True, slots=True)
class WorkforceRow:
    department_id: str
    department: str
    headcount: int
    active: int
    occupied_rate: Decimal
    staff_rate: Decimal
    planned_fot: Decimal
    actual_fot: Decimal


@dataclass(frozen=True, slots=True)
class WorkforceInput:
    department_id: str
    department: str
    active: bool
    employment_rate: Decimal
    monthly_salary: Decimal


@dataclass(frozen=True, slots=True)
class StaffCapacityInput:
    department_id: str
    rate: Decimal


@dataclass(frozen=True, slots=True)
class SalaryInput:
    department_id: str
    amount: Decimal


@dataclass(slots=True)
class _WorkforceAccumulator:
    department_id: str
    department: str
    headcount: int = 0
    active: int = 0
    occupied_rate: Decimal = Decimal(0)
    staff_rate: Decimal = Decimal(0)
    planned_fot: Decimal = Decimal(0)
    actual_fot: Decimal = Decimal(0)


def aggregate_workforce(
    employees: Sequence[WorkforceInput],
    staff: Sequence[StaffCapacityInput],
    salaries: Sequence[SalaryInput],
    months: int,
) -> tuple[tuple[WorkforceRow, ...], dict[str, Decimal | int]]:
    """Aggregate complete scoped rows by department using Decimal arithmetic."""
    data: dict[str, _WorkforceAccumulator] = {}
    for employee in employees:
        row = data.setdefault(
            employee.department_id,
            _WorkforceAccumulator(employee.department_id, employee.department),
        )
        row.headcount += 1
        row.active += int(employee.active)
        row.occupied_rate += employee.employment_rate
        row.planned_fot += employee.monthly_salary * months
    for item in staff:
        staff_row = data.get(item.department_id)
        if staff_row is not None:
            staff_row.staff_rate += item.rate
    for salary in salaries:
        salary_row = data.get(salary.department_id)
        if salary_row is not None:
            salary_row.actual_fot += salary.amount

    rows = tuple(
        WorkforceRow(
            item.department_id,
            item.department,
            item.headcount,
            item.active,
            item.occupied_rate,
            item.staff_rate,
            item.planned_fot,
            item.actual_fot,
        )
        for item in sorted(data.values(), key=lambda value: value.department.casefold())
    )
    total_keys = ("headcount", "active", "occupied_rate", "staff_rate", "planned_fot", "actual_fot")
    totals: dict[str, Decimal | int] = {}
    for key in total_keys:
        initial: int | Decimal = 0 if key in {"headcount", "active"} else Decimal(0)
        totals[key] = sum((getattr(row, key) for row in rows), initial)
    return rows, totals
