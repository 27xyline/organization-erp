from __future__ import annotations

from collections.abc import Callable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class SqlAlchemyPayrollInputLockRepository:
    """Acquire the global payroll-input gate in the caller-owned transaction."""

    _LOCK_NAMESPACE = 5_265_235  # stable application namespace, distinct from period keys
    _LOCK_KEY = 10

    def __init__(self, session: Callable[[], AsyncSession]) -> None:
        self._session = session

    async def lock_shared(self) -> None:
        await self._session().execute(
            text("SELECT pg_advisory_xact_lock_shared(:namespace, :key)"),
            {"namespace": self._LOCK_NAMESPACE, "key": self._LOCK_KEY},
        )

    async def lock_exclusive(self) -> None:
        await self._session().execute(
            text("SELECT pg_advisory_xact_lock(:namespace, :key)"),
            {"namespace": self._LOCK_NAMESPACE, "key": self._LOCK_KEY},
        )
