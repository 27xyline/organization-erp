from __future__ import annotations

import asyncio
import multiprocessing
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import delete, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models.enums import NotificationOutboxStatus
from app.models.notifications import Notification, NotificationOutbox
from app.models.users import User
from tests.audit_cleanup import clear_audit_logs_for_test_cleanup


def _stage13_database_url() -> str:
    value = os.environ.get("STAGE13_TEST_DATABASE_URL")
    if not value:
        pytest.skip("STAGE13_TEST_DATABASE_URL is required for the multiprocessing PostgreSQL test")
    parsed = make_url(value)
    if parsed.get_backend_name() != "postgresql" or parsed.database != "erp_stage13_test":
        pytest.fail("Multiprocessing outbox test requires the isolated erp_stage13_test database")
    if parsed.drivername in {"postgresql", "postgresql+psycopg"}:
        return parsed.set(drivername="postgresql+asyncpg").render_as_string(hide_password=False)
    return value


def _outbox_worker_process(
    database_url: str,
    worker_name: str,
    ready: object,
    start: object,
    send_started: object,
    release_smtp: object,
    block_smtp: bool,
    outcomes: object,
) -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.db.uow import create_unit_of_work_factory
    from app.services.outbox import process_outbox

    async def run() -> None:
        engine = create_async_engine(database_url, pool_size=1, max_overflow=0)
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        try:
            ready.set()  # type: ignore[attr-defined]
            if not await asyncio.to_thread(start.wait, 20):  # type: ignore[attr-defined]
                raise TimeoutError("start gate timed out")

            class Sender:
                async def send(self, payload: dict[str, object]) -> None:
                    outcomes.put(("sent", worker_name, str(payload["title"])))  # type: ignore[attr-defined]
                    if block_smtp:
                        send_started.set()  # type: ignore[attr-defined]
                        if not await asyncio.to_thread(release_smtp.wait, 20):  # type: ignore[attr-defined]
                            raise TimeoutError("SMTP release gate timed out")

            result = await process_outbox(
                Sender(), create_unit_of_work_factory(session_factory), limit=1
            )
            outcomes.put(("result", worker_name, result.sent, result.failed))  # type: ignore[attr-defined]
        finally:
            await engine.dispose()

    try:
        asyncio.run(run())
    except BaseException as error:
        outcomes.put(("crash", worker_name, type(error).__name__))  # type: ignore[attr-defined]


@pytest.mark.anyio
async def test_two_os_workers_send_one_claimed_outbox_row_at_most_once() -> None:
    database_url = _stage13_database_url()
    prefix = "s13-process-outbox-" + uuid4().hex
    user_id = prefix + "-user"
    engine = create_async_engine(database_url, pool_size=2, max_overflow=0)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        session.add(
            User(id=user_id, username=user_id, name=user_id, passwordHash="unused", role="ADMIN")
        )
        session.add(
            Notification(
                id=prefix,
                userId=user_id,
                eventType="SYSTEM",
                channel="EMAIL",
                title=prefix,
                body="process concurrency integration",
                dedupeKey=prefix,
            )
        )
        session.add(
            NotificationOutbox(
                id=prefix,
                notificationId=prefix,
                userId=user_id,
                payload={"eventType": "SYSTEM", "title": prefix, "body": "integration"},
            )
        )
        await session.commit()

    context = multiprocessing.get_context("spawn")
    first_ready, second_ready = context.Event(), context.Event()
    first_start, second_start = context.Event(), context.Event()
    send_started, release_smtp = context.Event(), context.Event()
    outcomes = context.Queue()
    first = context.Process(
        target=_outbox_worker_process,
        args=(
            database_url,
            "first",
            first_ready,
            first_start,
            send_started,
            release_smtp,
            True,
            outcomes,
        ),
    )
    second = context.Process(
        target=_outbox_worker_process,
        args=(
            database_url,
            "second",
            second_ready,
            second_start,
            send_started,
            release_smtp,
            False,
            outcomes,
        ),
    )
    processes = (first, second)
    observed: list[tuple[object, ...]] = []

    async def get_outcome() -> tuple[object, ...]:
        return await asyncio.to_thread(outcomes.get, True, 20)

    try:
        first.start()
        assert await asyncio.to_thread(first_ready.wait, 20)
        first_start.set()
        assert await asyncio.to_thread(send_started.wait, 20)

        # Keep the first worker inside SMTP while the second OS process tries to claim.
        second.start()
        assert await asyncio.to_thread(second_ready.wait, 20)
        second_start.set()
        while True:
            event = await get_outcome()
            observed.append(event)
            if event[:2] == ("result", "second"):
                break

        release_smtp.set()
        first.join(timeout=20)
        second.join(timeout=20)
        assert not first.is_alive() and not second.is_alive()
        while not any(event[:2] == ("result", "first") for event in observed):
            observed.append(await get_outcome())

        sent = [event for event in observed if event[0] == "sent"]
        results = {event[1]: event[2:] for event in observed if event[0] == "result"}
        crashes = [event for event in observed if event[0] == "crash"]
        assert crashes == []
        assert len(sent) == 1
        assert results == {"first": (1, 0), "second": (0, 0)}
        async with session_factory() as session:
            row = await session.get(NotificationOutbox, prefix)
            assert row is not None
            assert row.status == NotificationOutboxStatus.SENT
            assert row.attempts == 1
    finally:
        release_smtp.set()
        for process in processes:
            if process.pid is not None:
                process.join(timeout=5)
                if process.is_alive():
                    process.terminate()
                    process.join(timeout=5)
        async with session_factory() as session:
            await clear_audit_logs_for_test_cleanup(session)
            await session.execute(delete(NotificationOutbox).where(NotificationOutbox.id == prefix))
            await session.execute(delete(Notification).where(Notification.id == prefix))
            await session.execute(delete(User).where(User.id == user_id))
            await session.commit()
        outcomes.close()
        outcomes.join_thread()
        await engine.dispose()


@pytest.mark.anyio
async def test_crashed_worker_lease_is_retried_after_restart() -> None:
    database_url = _stage13_database_url()
    prefix = "s13-process-crash-" + uuid4().hex
    user_id = prefix + "-user"
    engine = create_async_engine(database_url, pool_size=2, max_overflow=0)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        session.add(
            User(id=user_id, username=user_id, name=user_id, passwordHash="unused", role="ADMIN")
        )
        session.add(
            Notification(
                id=prefix,
                userId=user_id,
                eventType="SYSTEM",
                channel="EMAIL",
                title=prefix,
                body="worker crash recovery integration",
                dedupeKey=prefix,
            )
        )
        session.add(
            NotificationOutbox(
                id=prefix,
                notificationId=prefix,
                userId=user_id,
                payload={"eventType": "SYSTEM", "title": prefix, "body": "integration"},
            )
        )
        await session.commit()

    context = multiprocessing.get_context("spawn")
    outcomes = context.Queue()
    crashed_ready, crashed_start = context.Event(), context.Event()
    crash_send_started, release_crashed_smtp = context.Event(), context.Event()
    crashed = context.Process(
        target=_outbox_worker_process,
        args=(
            database_url,
            "crashed",
            crashed_ready,
            crashed_start,
            crash_send_started,
            release_crashed_smtp,
            True,
            outcomes,
        ),
    )
    restarted_ready, restarted_start = context.Event(), context.Event()
    restarted_send_started, release_restarted_smtp = context.Event(), context.Event()
    restarted = context.Process(
        target=_outbox_worker_process,
        args=(
            database_url,
            "restarted",
            restarted_ready,
            restarted_start,
            restarted_send_started,
            release_restarted_smtp,
            False,
            outcomes,
        ),
    )
    try:
        crashed.start()
        assert await asyncio.to_thread(crashed_ready.wait, 20)
        crashed_start.set()
        assert await asyncio.to_thread(crash_send_started.wait, 20)
        assert await asyncio.to_thread(outcomes.get, True, 20) == ("sent", "crashed", prefix)

        # Kill the worker while SMTP is blocked; the committed lease must survive.
        crashed.terminate()
        await asyncio.to_thread(crashed.join, 10)
        assert not crashed.is_alive()
        async with session_factory() as session:
            row = await session.get(NotificationOutbox, prefix)
            assert row is not None
            assert row.status == NotificationOutboxStatus.PROCESSING
            assert row.attempts == 1
            await session.execute(
                text(
                    'UPDATE "notification_outbox" SET "leaseExpiresAt" = :expired WHERE "id" = :id'
                ),
                {
                    "expired": datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=1),
                    "id": prefix,
                },
            )
            await session.commit()

        restarted.start()
        assert await asyncio.to_thread(restarted_ready.wait, 20)
        restarted_start.set()
        result: tuple[object, ...] | None = None
        while result is None:
            event = await asyncio.to_thread(outcomes.get, True, 20)
            if event[:2] == ("result", "restarted"):
                result = event
        await asyncio.to_thread(restarted.join, 10)
        assert not restarted.is_alive()
        assert result == ("result", "restarted", 1, 0)
        async with session_factory() as session:
            row = await session.get(NotificationOutbox, prefix)
            assert row is not None
            assert row.status == NotificationOutboxStatus.SENT
            assert row.attempts == 2
    finally:
        for process in (crashed, restarted):
            if process.pid is not None:
                process.join(timeout=5)
                if process.is_alive():
                    process.terminate()
                    process.join(timeout=5)
        async with session_factory() as session:
            await clear_audit_logs_for_test_cleanup(session)
            await session.execute(delete(NotificationOutbox).where(NotificationOutbox.id == prefix))
            await session.execute(delete(Notification).where(Notification.id == prefix))
            await session.execute(delete(User).where(User.id == user_id))
            await session.commit()
        outcomes.close()
        outcomes.join_thread()
        await engine.dispose()
