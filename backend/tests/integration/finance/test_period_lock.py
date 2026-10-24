from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import delete, update

from app.domain.errors import DomainError
from app.models.finance import PayrollPeriod
from app.models.users import User
from app.repositories.payroll_periods import SqlAlchemyPayrollPeriodRepository
from tests.audit_cleanup import clear_audit_logs_for_test_cleanup


@pytest.mark.anyio
@pytest.mark.parametrize("writer", ["edit", "approve"])
async def test_close_blocks_writer_in_an_independent_postgres_session(
    stage10_session_factory, writer: str
) -> None:
    suffix = uuid4().hex
    user_id = f"s10-{suffix}"
    year = 2060 + int(suffix[:2], 16) % 40
    month = 1 + int(suffix[2:4], 16) % 12
    async with stage10_session_factory() as setup:
        setup.add(User(id=user_id, username=f"s10-{suffix}", name="Stage10", passwordHash="x"))
        await setup.commit()

    try:
        async with stage10_session_factory() as closing_session:
            await closing_session.begin()
            closing_repo = SqlAlchemyPayrollPeriodRepository(lambda: closing_session)
            status = await closing_repo.lock_period(year, month)
            assert status == "OPEN"
            period_id = await closing_session.scalar(
                PayrollPeriod.__table__.select()
                .with_only_columns(PayrollPeriod.id)
                .where(PayrollPeriod.year == year, PayrollPeriod.month == month)
            )
            await closing_session.execute(
                update(PayrollPeriod)
                .where(PayrollPeriod.id == period_id)
                .values(
                    status="CLOSED",
                    closedAt=datetime.now(UTC).replace(tzinfo=None),
                    closedById=user_id,
                )
            )
            waiting_writer = asyncio.create_task(
                _assert_closed(stage10_session_factory, year, month)
            )
            await asyncio.sleep(0.1)
            assert not waiting_writer.done(), f"{writer} writer did not wait for close lock"
            await closing_session.commit()
        with pytest.raises(DomainError) as raised:
            await asyncio.wait_for(waiting_writer, timeout=3)
        assert raised.value.code == "PERIOD_CLOSED"
    finally:
        async with stage10_session_factory() as cleanup:
            await clear_audit_logs_for_test_cleanup(cleanup)
            await cleanup.execute(
                delete(PayrollPeriod).where(
                    PayrollPeriod.year == year, PayrollPeriod.month == month
                )
            )
            await cleanup.execute(delete(User).where(User.id == user_id))
            await cleanup.commit()


async def _assert_closed(stage10_session_factory, year: int, month: int) -> None:
    async with stage10_session_factory() as session:
        repository = SqlAlchemyPayrollPeriodRepository(lambda: session)
        await repository.assert_open(year, month)


@pytest.mark.anyio
async def test_period_can_be_closed_and_reopened_only_with_a_reason(
    stage10_session_factory,
) -> None:
    suffix = uuid4().hex
    user_id = f"s10-{suffix}"
    year = 2060 + int(suffix[:2], 16) % 40
    month = 1 + int(suffix[2:4], 16) % 12
    async with stage10_session_factory() as setup:
        setup.add(User(id=user_id, username=f"s10-{suffix}", name="Stage10", passwordHash="x"))
        await setup.commit()

    try:
        async with stage10_session_factory() as session:
            repository = SqlAlchemyPayrollPeriodRepository(lambda: session)
            period = await repository.set_status(year, month, "CLOSED", user_id)
            assert period["status"] == "CLOSED"
            await session.commit()
        async with stage10_session_factory() as session:
            repository = SqlAlchemyPayrollPeriodRepository(lambda: session)
            with pytest.raises(DomainError) as raised:
                await repository.set_status(year, month, "OPEN", user_id)
            assert raised.value.code == "REOPEN_REASON_REQUIRED"
            await session.rollback()
        async with stage10_session_factory() as session:
            repository = SqlAlchemyPayrollPeriodRepository(lambda: session)
            period = await repository.set_status(
                year, month, "OPEN", user_id, reason="Повторная проверка"
            )
            assert period["status"] == "OPEN"
            await session.commit()
    finally:
        async with stage10_session_factory() as cleanup:
            await clear_audit_logs_for_test_cleanup(cleanup)
            await cleanup.execute(
                delete(PayrollPeriod).where(
                    PayrollPeriod.year == year, PayrollPeriod.month == month
                )
            )
            await cleanup.execute(delete(User).where(User.id == user_id))
            await cleanup.commit()
