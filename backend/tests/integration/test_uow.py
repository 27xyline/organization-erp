from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator
from typing import cast

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.uow import (
    SqlAlchemyUnitOfWorkFactory,
    UnitOfWorkStateError,
    create_unit_of_work_factory,
)
from app.domain.ports.audit import AuditRecord
from app.domain.ports.notifications import NotificationIntent
from app.domain.ports.uow import UnitOfWork
from app.models.notifications import Notification, NotificationOutbox
from app.models.users import AuditLog, User


@pytest.fixture
async def isolated_session_factory(
    db_engine,
) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    async with db_engine.connect() as connection:
        outer_transaction = await connection.begin()
        session_factory = async_sessionmaker(
            bind=connection,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        try:
            yield session_factory
        finally:
            if outer_transaction.is_active:
                await outer_transaction.rollback()


async def seed_user(session_factory: async_sessionmaker[AsyncSession]) -> str:
    user_id = f"uow-test-{uuid.uuid4().hex}"
    async with session_factory() as session:
        session.add(
            User(
                id=user_id,
                username=f"{user_id}@example.invalid",
                name="UoW test",
                passwordHash="not-a-real-password-hash",
            )
        )
        await session.commit()
    return user_id


def intent_for(user_id: str, dedupe_key: str) -> NotificationIntent:
    return NotificationIntent(
        user_id=user_id,
        event_type="SYSTEM",
        channel="IN_APP",
        title="UoW test",
        body="transaction test",
        dedupe_key=dedupe_key,
        payload={"dedupeKey": dedupe_key},
    )


async def nested_audit_operation(uow: UnitOfWork, marker: str, user_id: str) -> UnitOfWork:
    await uow.audit.append(AuditRecord("nested-test", "UoW", marker, user_id=user_id))
    return uow


@pytest.mark.anyio
async def test_exit_without_commit_rolls_back_audit_and_outbox(
    isolated_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await seed_user(isolated_session_factory)
    marker = uuid.uuid4().hex
    factory = create_unit_of_work_factory(isolated_session_factory)

    async with factory() as uow:
        await uow.audit.append(AuditRecord("test", "UoW", marker, user_id=user_id))
        await uow.notifications.enqueue(intent_for(user_id, marker))

    async with isolated_session_factory() as session:
        audit_count = await session.scalar(
            select(func.count()).select_from(AuditLog).where(AuditLog.entityId == marker)
        )
        outbox_count = await session.scalar(
            select(func.count())
            .select_from(NotificationOutbox)
            .join(Notification)
            .where(Notification.dedupeKey == marker)
        )

    assert audit_count == 0
    assert outbox_count == 0


@pytest.mark.anyio
async def test_exception_after_audit_and_outbox_write_rolls_back_both(
    isolated_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await seed_user(isolated_session_factory)
    marker = uuid.uuid4().hex
    factory = create_unit_of_work_factory(isolated_session_factory)

    with pytest.raises(RuntimeError, match="fail after first writes"):
        async with factory() as uow:
            await uow.audit.append(AuditRecord("test", "UoW", marker, user_id=user_id))
            await uow.notifications.enqueue(intent_for(user_id, marker))
            raise RuntimeError("fail after first writes")

    async with isolated_session_factory() as session:
        audit_count = await session.scalar(
            select(func.count()).select_from(AuditLog).where(AuditLog.entityId == marker)
        )
        outbox_count = await session.scalar(
            select(func.count())
            .select_from(NotificationOutbox)
            .join(Notification)
            .where(Notification.dedupeKey == marker)
        )

    assert audit_count == 0
    assert outbox_count == 0


@pytest.mark.anyio
async def test_cancellation_after_database_writes_rolls_back_audit_and_outbox(
    isolated_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await seed_user(isolated_session_factory)
    marker = uuid.uuid4().hex
    factory = create_unit_of_work_factory(isolated_session_factory)
    writes_flushed = asyncio.Event()

    async def write_then_wait() -> None:
        async with factory() as uow:
            await uow.audit.append(AuditRecord("test", "UoW", marker, user_id=user_id))
            await uow.notifications.enqueue(intent_for(user_id, marker))
            writes_flushed.set()
            await asyncio.Event().wait()

    task = asyncio.create_task(write_then_wait())
    await asyncio.wait_for(writes_flushed.wait(), timeout=5)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    async with isolated_session_factory() as session:
        audit_count = await session.scalar(
            select(func.count()).select_from(AuditLog).where(AuditLog.entityId == marker)
        )
        outbox_count = await session.scalar(
            select(func.count())
            .select_from(NotificationOutbox)
            .join(Notification)
            .where(Notification.dedupeKey == marker)
        )

    assert audit_count == 0
    assert outbox_count == 0


@pytest.mark.anyio
async def test_entry_failure_closes_session_and_factory_failure_is_terminal() -> None:
    class BeginFailure:
        closed = False

        async def begin(self) -> None:
            raise RuntimeError("begin failed")

        async def close(self) -> None:
            self.closed = True

    session = BeginFailure()
    session_factory = cast(async_sessionmaker[AsyncSession], lambda: session)
    uow_factory = SqlAlchemyUnitOfWorkFactory(session_factory)
    uow = uow_factory()

    with pytest.raises(RuntimeError, match="begin failed"):
        await uow.__aenter__()

    assert session.closed
    assert uow._session is None
    with pytest.raises(UnitOfWorkStateError, match="entered once"):
        await uow.__aenter__()

    def fail_to_create_session() -> AsyncSession:
        raise RuntimeError("factory failed")

    broken_factory = SqlAlchemyUnitOfWorkFactory(
        cast(async_sessionmaker[AsyncSession], fail_to_create_session)
    )()
    with pytest.raises(RuntimeError, match="factory failed"):
        await broken_factory.__aenter__()


@pytest.mark.anyio
async def test_explicit_commit_is_visible_and_terminal(
    isolated_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await seed_user(isolated_session_factory)
    marker = uuid.uuid4().hex
    factory = create_unit_of_work_factory(isolated_session_factory)

    async with factory() as uow:
        assert not hasattr(uow, "session")
        nested_uow = await nested_audit_operation(uow, marker, user_id)
        assert nested_uow is uow
        await uow.commit()
        with pytest.raises(UnitOfWorkStateError, match="already committed"):
            await uow.commit()
        with pytest.raises(UnitOfWorkStateError, match="already committed"):
            await uow.audit.append(AuditRecord("test", "UoW", marker, user_id=user_id))

    async with isolated_session_factory() as session:
        audit_count = await session.scalar(
            select(func.count()).select_from(AuditLog).where(AuditLog.entityId == marker)
        )

    assert audit_count == 1


@pytest.mark.anyio
async def test_audit_details_none_is_stored_as_sql_null(
    isolated_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await seed_user(isolated_session_factory)
    marker = uuid.uuid4().hex
    factory = create_unit_of_work_factory(isolated_session_factory)

    async with factory() as uow:
        await uow.audit.append(AuditRecord("test", "UoW", marker, user_id=user_id, details=None))
        await uow.commit()

    async with isolated_session_factory() as session:
        details_are_sql_null = await session.scalar(
            select(AuditLog.details.is_(None)).where(AuditLog.entityId == marker)
        )

    assert details_are_sql_null is True


@pytest.mark.anyio
async def test_concurrent_units_of_work_own_distinct_sessions_and_connections(
    db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    factory = create_unit_of_work_factory(db_session_factory)
    first = factory()
    second = factory()

    async with first, second:
        assert first._session is not None
        assert second._session is not None
        assert first._session is not second._session
        first_pid = await first._session.scalar(text("SELECT pg_backend_pid()"))
        second_pid = await second._session.scalar(text("SELECT pg_backend_pid()"))

    assert first_pid != second_pid
