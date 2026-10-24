"""Reporting persistence boundary: repositories return detached projections."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol

from app.domain.auth.rules import AccessContext


class ReportingRepository(Protocol):
    async def dashboard(
        self, query: dict[str, str | None], access: AccessContext, now: datetime
    ) -> dict[str, Any]: ...

    async def turnover(
        self,
        date_from: datetime,
        date_to: datetime,
        department_id: str | None,
        access: AccessContext,
    ) -> dict[str, Any]: ...

    async def profitability(
        self,
        date_from: datetime,
        date_to: datetime,
        project_id: str | None,
        access: AccessContext,
    ) -> list[dict[str, Any]]: ...

    async def depreciation(
        self,
        date_from: datetime,
        date_to: datetime,
        department_id: str | None,
        access: AccessContext,
    ) -> dict[str, Any]: ...

    async def vacation_calendar(
        self,
        date_from: datetime,
        date_to: datetime,
        department_id: str | None,
        access: AccessContext,
    ) -> list[dict[str, Any]]: ...

    async def custom_report(
        self,
        group_by: str,
        metrics: list[str],
        date_from: datetime,
        date_to: datetime,
        department_id: str | None,
        project_id: str | None,
        access: AccessContext,
    ) -> list[dict[str, Any]]: ...

    async def list_presets(self, user_id: str) -> list[dict[str, Any]]: ...

    async def save_preset(self, user_id: str, body: dict[str, Any]) -> dict[str, Any]: ...

    async def delete_preset(self, user_id: str, preset_id: str) -> bool: ...
