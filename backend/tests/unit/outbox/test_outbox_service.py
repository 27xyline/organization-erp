from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

import pytest

from app.domain.ports.outbox import ClaimedOutbox, ProcessingResult
from app.services.outbox import process_outbox


@dataclass
class FakeRepository:
    rows: list[ClaimedOutbox]
    completed: list[str]
    failures: list[tuple[str, int, str]]
    reclaimed: int = 0

    async def reclaim_exhausted(self, now: datetime) -> int:
        return self.reclaimed

    async def claim(self, now: datetime) -> ClaimedOutbox | None:
        return self.rows.pop(0) if self.rows else None

    async def complete(self, item_id: str, claim_token: str, now: datetime) -> bool:
        self.completed.append(item_id)
        return True

    async def fail(
        self, item_id: str, claim_token: str, attempts: int, error: str, now: datetime
    ) -> bool:
        self.failures.append((item_id, attempts, error))
        return True


class FakeUow:
    def __init__(self, repository: FakeRepository) -> None:
        self.outbox = repository

    async def __aenter__(self) -> FakeUow:
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def commit(self) -> None:
        return None


def factory(repository: FakeRepository, _sent_flag: list[bool] | None = None):
    @asynccontextmanager
    async def make_uow():
        yield FakeUow(repository)

    return make_uow


def item(attempts: int = 1) -> ClaimedOutbox:
    return ClaimedOutbox(
        id="outbox-1",
        user_id="user-1",
        payload={"eventType": "SYSTEM", "title": "title", "body": "body"},
        attempts=attempts,
        claim_token="claim-1",
    )


class FakeSender:
    def __init__(self, send: Any) -> None:
        self._send = send

    async def send(self, payload: dict[str, Any]) -> None:
        await self._send(payload)


@pytest.mark.anyio
async def test_smtp_runs_after_claim_transaction_and_records_completion() -> None:
    repo = FakeRepository([item()], [], [])
    sent: list[bool] = []

    async def sender(_payload: dict[str, Any]) -> None:
        sent.append(True)

    result = await process_outbox(FakeSender(sender), factory(repo, sent), now=datetime(2026, 1, 1))

    assert result == ProcessingResult(sent=1, failed=0, skipped=0)
    assert repo.completed == ["outbox-1"]


@pytest.mark.anyio
async def test_send_failure_is_recorded_without_persisting_error_message() -> None:
    repo = FakeRepository([item(2)], [], [])

    async def sender(_payload: dict[str, Any]) -> None:
        raise RuntimeError("recipient email address is private")

    result = await process_outbox(FakeSender(sender), factory(repo, []), now=datetime(2026, 1, 1))

    assert result.failed == 1
    assert repo.failures[0][1] == 2
    assert repo.failures[0][2] == "RuntimeError"


@pytest.mark.anyio
async def test_limit_is_clamped_to_one_through_one_hundred() -> None:
    now = datetime(2026, 1, 1)
    repo = FakeRepository([item() for _ in range(105)], [], [])

    async def sender(_payload: dict[str, Any]) -> None:
        return None

    result = await process_outbox(FakeSender(sender), factory(repo, []), limit=1000, now=now)

    assert result.sent == 100
    assert len(repo.rows) == 5


@pytest.mark.anyio
async def test_completion_database_error_propagates_after_smtp_acceptance() -> None:
    class BrokenCompletionRepository(FakeRepository):
        async def complete(self, item_id: str, claim_token: str, now: datetime) -> bool:
            raise RuntimeError("database error includes SQL and row details")

    repo = BrokenCompletionRepository([item()], [], [])
    accepted: list[str] = []

    async def sender(payload: dict[str, Any]) -> None:
        accepted.append(payload["userId"])

    with pytest.raises(RuntimeError, match="database error"):
        await process_outbox(FakeSender(sender), factory(repo), now=datetime(2026, 1, 1))

    assert accepted == ["user-1"]


@pytest.mark.anyio
async def test_default_clock_refreshes_time_for_each_claim_and_completion() -> None:
    start = datetime(2026, 1, 1)
    timestamps = iter(
        [
            start,
            start,
            start + timedelta(minutes=6),
            start + timedelta(minutes=6),
            start + timedelta(minutes=6),
        ]
    )
    calls: list[tuple[str, datetime]] = []
    rows = [item(), ClaimedOutbox("outbox-2", "user-2", item().payload, 1, "claim-2")]

    class TimedRepository(FakeRepository):
        async def reclaim_exhausted(self, now: datetime) -> int:
            calls.append(("reclaim", now))
            return 0

        async def claim(self, now: datetime) -> ClaimedOutbox | None:
            calls.append(("claim", now))
            return await super().claim(now)

        async def complete(self, item_id: str, claim_token: str, now: datetime) -> bool:
            calls.append((f"complete:{item_id}", now))
            return await super().complete(item_id, claim_token, now)

    repository = TimedRepository(rows, [], [])

    async def sender(_payload: dict[str, Any]) -> None:
        return None

    await process_outbox(
        FakeSender(sender),
        factory(repository),
        limit=2,
        clock=lambda: next(timestamps),
    )

    assert calls == [
        ("reclaim", start),
        ("claim", start),
        ("complete:outbox-1", start + timedelta(minutes=6)),
        ("claim", start + timedelta(minutes=6)),
        ("complete:outbox-2", start + timedelta(minutes=6)),
    ]
