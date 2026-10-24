"""PostgreSQL leasing and completion for detached email delivery records."""

from __future__ import annotations

from collections.abc import Callable
from copy import deepcopy
from datetime import datetime, timedelta
from typing import Any, cast
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.ports.outbox import ClaimedOutbox


class SqlAlchemyOutboxRepository:
    def __init__(self, session: Callable[[], AsyncSession]) -> None:
        self._session = session

    async def reclaim_exhausted(self, now: datetime) -> int:
        result = await self._session().execute(
            text(
                """UPDATE "notification_outbox"
                   SET "status" = 'FAILED', "claimToken" = NULL, "leaseExpiresAt" = NULL,
                       "processedAt" = :now, "lastError" = 'LEASE_EXPIRED_AFTER_MAX_ATTEMPTS',
                       "updatedAt" = :now
                   WHERE "status" = 'PROCESSING' AND "attempts" >= 5
                     AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= :now)"""
            ),
            {"now": now},
        )
        return int(cast(CursorResult[Any], result).rowcount or 0)

    async def claim(self, now: datetime) -> ClaimedOutbox | None:
        token = str(uuid4())
        row = (
            (
                await self._session().execute(
                    text(
                        '''WITH candidate AS (
                         SELECT "id" FROM "notification_outbox"
                         WHERE "attempts" < 5 AND "availableAt" <= :now
                           AND ("status" IN ('PENDING', 'FAILED') OR
                             ("status" = 'PROCESSING' AND
                               ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= :now)))
                         ORDER BY "availableAt", "id"
                         FOR UPDATE SKIP LOCKED LIMIT 1
                       )
                       UPDATE "notification_outbox" AS outbox
                       SET "status" = 'PROCESSING', "attempts" = outbox."attempts" + 1,
                           "claimToken" = :token, "leaseExpiresAt" = :now + INTERVAL '5 minutes',
                           "updatedAt" = :now
                       FROM candidate WHERE outbox."id" = candidate."id"
                       RETURNING outbox."id", outbox."userId", outbox."payload",
                                 outbox."attempts"'''
                    ),
                    {"now": now, "token": token},
                )
            )
            .mappings()
            .first()
        )
        if row is None:
            return None
        # Copy the JSON before the transaction closes: the sender receives no ORM state.
        return ClaimedOutbox(
            str(row["id"]),
            str(row["userId"]),
            deepcopy(dict(row["payload"])),
            int(row["attempts"]),
            token,
        )

    async def complete(self, item_id: str, claim_token: str, now: datetime) -> bool:
        result = await self._session().execute(
            text(
                """UPDATE "notification_outbox" SET "status" = 'SENT', "processedAt" = :now,
                   "claimToken" = NULL, "leaseExpiresAt" = NULL, "lastError" = NULL,
                   "updatedAt" = :now
                   WHERE "id" = :id AND "status" = 'PROCESSING' AND "claimToken" = :token"""
            ),
            {"now": now, "id": item_id, "token": claim_token},
        )
        return bool(cast(CursorResult[Any], result).rowcount)

    async def fail(
        self, item_id: str, claim_token: str, attempts: int, error: str, now: datetime
    ) -> bool:
        terminal = attempts >= 5
        result = await self._session().execute(
            text(
                """UPDATE "notification_outbox"
                   SET "status" = CASE WHEN :terminal
                       THEN 'FAILED'::notification_outbox_status
                       ELSE 'PENDING'::notification_outbox_status END,
                       "availableAt" = :available_at,
                       "processedAt" = CASE WHEN :terminal
                           THEN CAST(:now AS timestamp without time zone)
                           ELSE NULL::timestamp without time zone END,
                       "claimToken" = NULL, "leaseExpiresAt" = NULL, "lastError" = :error,
                       "updatedAt" = :now
                   WHERE "id" = :id AND "status" = 'PROCESSING' AND "claimToken" = :token"""
            ),
            {
                "terminal": terminal,
                "available_at": now + timedelta(minutes=2**attempts),
                "now": now,
                "error": error[:1000],
                "id": item_id,
                "token": claim_token,
            },
        )
        return bool(cast(CursorResult[Any], result).rowcount)
