from __future__ import annotations

from decimal import Decimal
from typing import Any, Protocol


class FinanceRepository(Protocol):
    async def employees(self) -> list[Any]: ...
    async def projects_for_plan(self, included_ids: tuple[str, ...] = ()) -> list[Any]: ...
    async def projects(self, identifiers: tuple[str, ...]) -> list[Any]: ...
    async def plan_entries(
        self,
        year: int,
        *,
        plan_type: str | None = None,
        employee_ids: tuple[str, ...] = (),
        project_id: str | None = None,
        project_only: bool = False,
    ) -> list[Any]: ...
    async def cell_entries(
        self,
        employee_id: str,
        year: int,
        month: int,
        plan_type: str,
        project_scope: str | None = None,
    ) -> list[Any]: ...
    async def project_member(self, project_id: str, employee_id: str) -> Any | None: ...
    async def project_payroll_members(self, project_id: str) -> list[Any]: ...
    async def project(self, project_id: str) -> Any | None: ...
    async def replace_cell(
        self,
        employee_id: str,
        year: int,
        month: int,
        plan_type: str,
        allocations: tuple[tuple[str, Decimal], ...],
        project_scope: str | None = None,
    ) -> list[Any]: ...
    async def clear_cell(
        self,
        employee_id: str,
        year: int,
        month: int,
        plan_type: str,
        project_scope: str | None = None,
    ) -> None: ...
    async def adjust_project_budgets(
        self, decrements: dict[str, Decimal], increments: dict[str, Decimal]
    ) -> None: ...
