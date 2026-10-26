from __future__ import annotations

from collections.abc import Callable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class SqlAlchemyPayrollInputLockRepository:
    """Захватывает общие блокировки ввода данных расчёта зарплаты в транзакции вызывающего кода."""

    _LOCK_NAMESPACE = 5_265_235  # стабильное пространство имён приложения, отдельное от
    # ключей периодов
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
