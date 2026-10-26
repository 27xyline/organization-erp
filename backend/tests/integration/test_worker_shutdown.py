from __future__ import annotations

import asyncio

import pytest

from app.tasks.notifications import run_notification_worker


@pytest.mark.anyio
async def test_shutdown_waits_for_both_in_flight_jobs() -> None:
    stop = asyncio.Event()
    completed: list[str] = []

    async def email() -> None:
        await asyncio.sleep(0)
        completed.append("email")
        stop.set()

    async def alerts() -> None:
        await asyncio.sleep(0)
        completed.append("alerts")

    await run_notification_worker(stop, email, alerts)

    assert set(completed) == {"email", "alerts"}


@pytest.mark.anyio
async def test_metrics_failures_do_not_interrupt_worker_jobs() -> None:
    stop = asyncio.Event()
    completed: list[str] = []

    class BrokenMetrics:
        def heartbeat(self) -> None:
            raise RuntimeError("metric sink unavailable")

        def record_job(self, _job: str, _succeeded: bool) -> None:
            raise RuntimeError("metric sink unavailable")

    async def email() -> None:
        completed.append("email")
        stop.set()

    async def alerts() -> None:
        completed.append("alerts")

    async def broken_snapshot() -> None:
        raise RuntimeError("database snapshot unavailable")

    await run_notification_worker(
        stop,
        email,
        alerts,
        metrics=BrokenMetrics(),  # type: ignore[arg-type]
        snapshot=broken_snapshot,
    )

    assert set(completed) == {"email", "alerts"}
