"""PostgreSQL advisory lock and run-state persistence for scheduled alerts."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


class SqlAlchemyScheduledAlertLock:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    @asynccontextmanager
    async def hold(self) -> AsyncIterator[object | None]:
        """Keep a dedicated PG connection only while the generator runs."""
        async with self._engine.connect() as connection:
            acquired = bool(
                await connection.scalar(
                    text("SELECT pg_try_advisory_lock(hashtext('scheduled-alerts'))")
                )
            )
            if not acquired:
                yield None
                return
            try:
                yield connection
            finally:
                await connection.execute(
                    text("SELECT pg_advisory_unlock(hashtext('scheduled-alerts'))")
                )
                await connection.commit()

    async def state(self, connection: object) -> tuple[datetime | None, datetime | None]:
        row = (
            await connection.execute(  # type: ignore[attr-defined]
                text(
                    'SELECT "lastStartedAt", "lastSucceededAt" FROM "scheduled_alert_runs" '
                    "WHERE \"key\" = 'scheduled-alerts'"
                )
            )
        ).first()
        return (row[0], row[1]) if row else (None, None)

    async def started(self, connection: object, now: datetime) -> None:
        await connection.execute(  # type: ignore[attr-defined]
            text(
                """INSERT INTO "scheduled_alert_runs" ("key", "lastStartedAt", "updatedAt")
                   VALUES ('scheduled-alerts', :now, :now)
                   ON CONFLICT ("key") DO UPDATE SET "lastStartedAt" = :now, "updatedAt" = :now"""
            ),
            {"now": now},
        )
        await connection.commit()  # type: ignore[attr-defined]

    async def succeeded(self, connection: object, now: datetime) -> None:
        await connection.execute(  # type: ignore[attr-defined]
            text(
                """UPDATE "scheduled_alert_runs" SET "lastSucceededAt" = :now,
                   "lastError" = NULL, "updatedAt" = :now WHERE "key" = 'scheduled-alerts'"""
            ),
            {"now": now},
        )
        await connection.commit()  # type: ignore[attr-defined]

    async def failed(self, connection: object, now: datetime, error: str) -> None:
        await connection.execute(  # type: ignore[attr-defined]
            text(
                """UPDATE "scheduled_alert_runs" SET "lastError" = :error, "updatedAt" = :now
                   WHERE "key" = 'scheduled-alerts'"""
            ),
            {"now": now, "error": error[:1000]},
        )
        await connection.commit()  # type: ignore[attr-defined]
