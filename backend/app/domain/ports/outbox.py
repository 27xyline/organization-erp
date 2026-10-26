"""Записи доставки почты без ORM-моделей и граница транзакционной очереди."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol


@dataclass(frozen=True, slots=True)
class ClaimedOutbox:
    id: str
    user_id: str
    payload: dict[str, Any]
    attempts: int
    claim_token: str


@dataclass(frozen=True, slots=True)
class ProcessingResult:
    sent: int = 0
    failed: int = 0
    skipped: int = 0


class OutboxRepository(Protocol):
    async def reclaim_exhausted(self, now: datetime) -> int: ...
    async def claim(self, now: datetime) -> ClaimedOutbox | None: ...
    async def complete(self, item_id: str, claim_token: str, now: datetime) -> bool: ...
    async def fail(
        self, item_id: str, claim_token: str, attempts: int, error: str, now: datetime
    ) -> bool: ...
