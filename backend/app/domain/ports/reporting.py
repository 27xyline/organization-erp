"""Reporting persistence boundary: repositories return detached projections."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any, Protocol

from app.domain.auth.rules import AccessContext


class ReportingRepository(Protocol):
    async def dashboard(
        self, query: Mapping[str, str], access: AccessContext, now: datetime
    ) -> Mapping[str, Any]: ...

    async def turnover(
        self,
        date_from: datetime,
        date_to: datetime,
        department_id: str | None,
        access: AccessContext,
    ) -> Mapping[str, Any]: ...

    async def profitability(
        self,
        date_from: datetime,
        date_to: datetime,
        project_id: str | None,
        access: AccessContext,
    ) -> Sequence[Mapping[str, Any]]: ...

    async def depreciation(
        self,
        date_from: datetime,
        date_to: datetime,
        department_id: str | None,
        access: AccessContext,
    ) -> Mapping[str, Any]: ...

    async def vacation_calendar(
        self,
        date_from: datetime,
        date_to: datetime,
        department_id: str | None,
        access: AccessContext,
    ) -> Sequence[Mapping[str, Any]]: ...

    async def custom_report(
        self,
        group_by: str,
        metrics: Sequence[str],
        date_from: datetime,
        date_to: datetime,
        department_id: str | None,
        project_id: str | None,
        access: AccessContext,
    ) -> Sequence[Mapping[str, Any]]: ...
