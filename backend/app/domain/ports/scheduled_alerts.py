"""Persistence boundaries for scheduled alert runs and source queries."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from contextlib import AbstractAsyncContextManager
from datetime import datetime
from typing import Any, Protocol


class ScheduledAlertRunPort(Protocol):
    def hold(self) -> AbstractAsyncContextManager[object | None]: ...

    async def state(self, connection: object) -> tuple[datetime | None, datetime | None]: ...

    async def started(self, connection: object, now: datetime) -> None: ...

    async def succeeded(self, connection: object, now: datetime) -> None: ...

    async def failed(self, connection: object, now: datetime, error: str) -> None: ...


class ScheduledAlertQueries(Protocol):
    async def contracts(
        self, start_day: datetime, end_30: datetime
    ) -> Sequence[Mapping[str, Any]]: ...

    async def overdue_tasks(self, start_day: datetime) -> Sequence[Mapping[str, Any]]: ...

    async def assets_for_disposal(
        self, start_day: datetime, end_30: datetime
    ) -> Sequence[Mapping[str, Any]]: ...

    async def users_in_scope(
        self, role: str, scope_kind: str, scope_id: str
    ) -> tuple[str, ...]: ...

    async def over_budget_projects(self) -> Sequence[Mapping[str, Any]]: ...

    async def maintenance(
        self, start_30: datetime, end_30: datetime
    ) -> Sequence[Mapping[str, Any]]: ...

    async def approval_reminders(self, end_1: datetime) -> Sequence[Mapping[str, Any]]: ...

    async def mark_approval_reminder_sent(self, step_id: str) -> None: ...
