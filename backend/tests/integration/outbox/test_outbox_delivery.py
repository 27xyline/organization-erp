from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import delete, select

from app.db.uow import create_unit_of_work_factory
from app.models.enums import NotificationOutboxStatus
from app.models.notifications import Notification, NotificationOutbox
from app.models.users import User
from app.services.outbox import process_outbox
from tests.audit_cleanup import clear_audit_logs_for_test_cleanup


@pytest.mark.anyio
async def test_two_processors_claim_distinct_rows_and_complete(db_session_factory) -> None:
    prefix = "s13-outbox-" + uuid4().hex
    user_id = prefix + "-user"
    ids = [prefix + "-a", prefix + "-b"]
    async with db_session_factory() as session:
        session.add(
            User(id=user_id, username=user_id, name=user_id, passwordHash="unused", role="ADMIN")
        )
        for identifier in ids:
            session.add(
                Notification(
                    id=identifier,
                    userId=user_id,
                    eventType="SYSTEM",
                    channel="EMAIL",
                    title=identifier,
                    body="integration",
                    dedupeKey=identifier,
                )
            )
            session.add(
                NotificationOutbox(
                    id=identifier,
                    notificationId=identifier,
                    userId=user_id,
                    payload={"eventType": "SYSTEM", "title": identifier, "body": "integration"},
                )
            )
        await session.commit()

    barrier = asyncio.Event()
    arrived = 0
    delivered: list[str] = []

    class Sender:
        async def send(self, payload):
            nonlocal arrived
            delivered.append(payload["title"])
            arrived += 1
            if arrived == 2:
                barrier.set()
            await asyncio.wait_for(barrier.wait(), timeout=5)

    try:
        factory = create_unit_of_work_factory(db_session_factory)
        first, second = await asyncio.gather(
            process_outbox(Sender(), factory, limit=1),
            process_outbox(Sender(), factory, limit=1),
        )
        assert first.sent + second.sent == 2
        assert set(delivered) == set(ids)
        async with db_session_factory() as session:
            statuses = (
                await session.scalars(
                    select(NotificationOutbox.status).where(NotificationOutbox.id.in_(ids))
                )
            ).all()
        assert statuses == [NotificationOutboxStatus.SENT] * 2
    finally:
        async with db_session_factory() as session:
            await clear_audit_logs_for_test_cleanup(session)
            await session.execute(delete(NotificationOutbox).where(NotificationOutbox.id.in_(ids)))
            await session.execute(delete(Notification).where(Notification.id.in_(ids)))
            await session.execute(delete(User).where(User.id == user_id))
            await session.commit()


@pytest.mark.anyio
async def test_expired_fifth_attempt_is_made_terminal(db_session_factory) -> None:
    prefix = "s13-outbox-" + uuid4().hex
    user_id = prefix + "-user"
    async with db_session_factory() as session:
        session.add(
            User(id=user_id, username=user_id, name=user_id, passwordHash="unused", role="ADMIN")
        )
        session.add(
            Notification(
                id=prefix,
                userId=user_id,
                eventType="SYSTEM",
                channel="EMAIL",
                title="expired",
                body="integration",
                dedupeKey=prefix,
            )
        )
        session.add(
            NotificationOutbox(
                id=prefix,
                notificationId=prefix,
                userId=user_id,
                payload={"eventType": "SYSTEM", "title": "expired", "body": "integration"},
                status=NotificationOutboxStatus.PROCESSING,
                attempts=5,
                leaseExpiresAt=datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=1),
            )
        )
        await session.commit()

    try:

        class Sender:
            async def send(self, _payload):
                raise AssertionError("exhausted lease must not be sent again")

        result = await process_outbox(Sender(), create_unit_of_work_factory(db_session_factory))
        assert result.sent == 0
        async with db_session_factory() as session:
            row = await session.get(NotificationOutbox, prefix)
            assert row is not None and row.status == NotificationOutboxStatus.FAILED
            assert row.lastError == "LEASE_EXPIRED_AFTER_MAX_ATTEMPTS"
    finally:
        async with db_session_factory() as session:
            await clear_audit_logs_for_test_cleanup(session)
            await session.execute(delete(NotificationOutbox).where(NotificationOutbox.id == prefix))
            await session.execute(delete(Notification).where(Notification.id == prefix))
            await session.execute(delete(User).where(User.id == user_id))
            await session.commit()


@pytest.mark.anyio
async def test_expired_nonterminal_lease_is_reclaimed(db_session_factory) -> None:
    prefix = "s13-outbox-" + uuid4().hex
    user_id = prefix + "-user"
    async with db_session_factory() as session:
        session.add(
            User(id=user_id, username=user_id, name=user_id, passwordHash="unused", role="ADMIN")
        )
        session.add(
            Notification(
                id=prefix,
                userId=user_id,
                eventType="SYSTEM",
                channel="EMAIL",
                title="reclaim",
                body="integration",
                dedupeKey=prefix,
            )
        )
        session.add(
            NotificationOutbox(
                id=prefix,
                notificationId=prefix,
                userId=user_id,
                payload={"eventType": "SYSTEM", "title": "reclaim", "body": "integration"},
                status=NotificationOutboxStatus.PROCESSING,
                attempts=2,
                leaseExpiresAt=datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=1),
            )
        )
        await session.commit()

    try:
        accepted: list[str] = []

        class Sender:
            async def send(self, payload):
                accepted.append(payload["title"])

        result = await process_outbox(Sender(), create_unit_of_work_factory(db_session_factory))
        assert result.sent == 1
        assert accepted == ["reclaim"]
        async with db_session_factory() as session:
            row = await session.get(NotificationOutbox, prefix)
            assert row is not None
            assert row.status == NotificationOutboxStatus.SENT
            assert row.attempts == 3
            assert row.claimToken is None
    finally:
        async with db_session_factory() as session:
            await clear_audit_logs_for_test_cleanup(session)
            await session.execute(delete(NotificationOutbox).where(NotificationOutbox.id == prefix))
            await session.execute(delete(Notification).where(Notification.id == prefix))
            await session.execute(delete(User).where(User.id == user_id))
            await session.commit()


@pytest.mark.anyio
async def test_send_failure_uses_exponential_retry_time_and_redacts_error(
    db_session_factory,
) -> None:
    prefix = "s13-outbox-" + uuid4().hex
    user_id = prefix + "-user"
    async with db_session_factory() as session:
        session.add(
            User(
                id=user_id,
                username=user_id,
                name=user_id,
                passwordHash="unused",
                role="ADMIN",
            )
        )
        session.add(
            Notification(
                id=prefix,
                userId=user_id,
                eventType="SYSTEM",
                channel="EMAIL",
                title="retry",
                body="integration",
                dedupeKey=prefix,
            )
        )
        session.add(
            NotificationOutbox(
                id=prefix,
                notificationId=prefix,
                userId=user_id,
                attempts=1,
                payload={"eventType": "SYSTEM", "title": "retry", "body": "integration"},
            )
        )
        await session.commit()

    try:

        class Sender:
            async def send(self, _payload):
                raise RuntimeError("private recipient detail")

        result = await process_outbox(Sender(), create_unit_of_work_factory(db_session_factory))
        assert result.failed == 1
        async with db_session_factory() as session:
            row = await session.get(NotificationOutbox, prefix)
            assert row is not None
            assert row.status == NotificationOutboxStatus.PENDING
            assert row.attempts == 2
            assert row.availableAt >= datetime.now(UTC).replace(tzinfo=None) + timedelta(minutes=3)
            assert row.lastError == "RuntimeError"
    finally:
        async with db_session_factory() as session:
            await clear_audit_logs_for_test_cleanup(session)
            await session.execute(delete(NotificationOutbox).where(NotificationOutbox.id == prefix))
            await session.execute(delete(Notification).where(Notification.id == prefix))
            await session.execute(delete(User).where(User.id == user_id))
            await session.commit()


@pytest.mark.anyio
async def test_stale_worker_cannot_complete_reclaimed_claim(db_session_factory) -> None:
    prefix = "s13-outbox-" + uuid4().hex
    user_id = prefix + "-user"
    async with db_session_factory() as session:
        session.add(
            User(id=user_id, username=user_id, name=user_id, passwordHash="unused", role="ADMIN")
        )
        session.add(
            Notification(
                id=prefix,
                userId=user_id,
                eventType="SYSTEM",
                channel="EMAIL",
                title="claim token",
                body="integration",
                dedupeKey=prefix,
            )
        )
        session.add(
            NotificationOutbox(
                id=prefix,
                notificationId=prefix,
                userId=user_id,
                payload={"eventType": "SYSTEM", "title": "claim token", "body": "integration"},
            )
        )
        await session.commit()

    try:
        factory = create_unit_of_work_factory(db_session_factory)
        now = datetime.now(UTC).replace(tzinfo=None)
        async with factory() as uow:
            claimed = await uow.outbox.claim(now)
            await uow.commit()
        assert claimed is not None

        async with db_session_factory() as session:
            row = await session.get(NotificationOutbox, prefix)
            assert row is not None
            row.claimToken = "replacement-claim"
            row.leaseExpiresAt = now + timedelta(minutes=5)
            await session.commit()

        async with factory() as uow:
            updated = await uow.outbox.complete(prefix, claimed.claim_token, now)
            await uow.commit()
        assert updated is False
        async with db_session_factory() as session:
            row = await session.get(NotificationOutbox, prefix)
            assert row is not None
            assert row.status == NotificationOutboxStatus.PROCESSING
            assert row.claimToken == "replacement-claim"
    finally:
        async with db_session_factory() as session:
            await clear_audit_logs_for_test_cleanup(session)
            await session.execute(delete(NotificationOutbox).where(NotificationOutbox.id == prefix))
            await session.execute(delete(Notification).where(Notification.id == prefix))
            await session.execute(delete(User).where(User.id == user_id))
            await session.commit()
