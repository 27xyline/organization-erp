"""Transaction-scoped coordination for payroll calculations and HR input changes."""

from __future__ import annotations

from typing import Protocol


class PayrollInputLock(Protocol):
    async def lock_shared(self) -> None: ...

    async def lock_exclusive(self) -> None: ...
