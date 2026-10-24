from __future__ import annotations

import asyncio
from datetime import datetime

import pytest
from sqlalchemy import text

from app.core.context import RequestContext
from app.db.uow import create_unit_of_work_factory
from app.services.scheduled_alerts import (
    AlertResult,
    ScheduledAlertContext,
    run_scheduled_alerts,
)


@pytest.mark.anyio
async def test_concurrent_workers_generate_alerts_once(db_engine, db_session_factory) -> None:
    async with db_engine.begin() as connection:
        await connection.execute(
            text('DELETE FROM "scheduled_alert_runs" WHERE "key" = \'scheduled-alerts\'')
        )
    calls = 0

    async def generate(_now: datetime, _context: RequestContext) -> AlertResult:
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.1)
        return AlertResult(ran=True, generated=1, email_queued=0, sources={"test": 1})

    context = RequestContext(request_id="scheduled-alert-lock-test")
    generation_context = ScheduledAlertContext(
        context,
        db_engine,
        create_unit_of_work_factory(db_session_factory),
        db_session_factory,
        generate,
    )
    try:
        first, second = await asyncio.gather(
            run_scheduled_alerts(generation_context, force=True),
            run_scheduled_alerts(generation_context, force=True),
        )
        assert calls == 1
        assert sorted((first.ran, second.ran)) == [False, True]
    finally:
        async with db_engine.begin() as connection:
            await connection.execute(
                text('DELETE FROM "scheduled_alert_runs" WHERE "key" = \'scheduled-alerts\'')
            )
