from __future__ import annotations

from typing import Protocol


class PayrollPeriodRepository(Protocol):
    async def get_status(self, year: int, month: int) -> str | None: ...

    async def lock_period(self, year: int, month: int) -> str: ...

    async def assert_open(self, year: int, month: int) -> None: ...

    async def set_status(
        self,
        year: int,
        month: int,
        status: str,
        actor_id: str,
        reason: str | None = None,
    ) -> dict[str, object]: ...
