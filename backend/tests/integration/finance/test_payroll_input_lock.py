from __future__ import annotations

import asyncio
from uuid import uuid4

import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.uow import SqlAlchemyUnitOfWorkFactory
from app.models.finance import PayrollPeriod


@pytest.mark.anyio
async def test_exclusive_payroll_input_gate_waits_for_shared_reader_uow(
    stage10_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    factory = SqlAlchemyUnitOfWorkFactory(stage10_session_factory)
    async with factory() as reader:
        await reader.payroll_input_lock.lock_shared()
        waiting_writer = asyncio.create_task(_take_exclusive(factory))
        await asyncio.sleep(0.1)
        assert not waiting_writer.done(), "HR writer must wait until payroll read UoW ends"
    await asyncio.wait_for(waiting_writer, timeout=3)


async def _take_exclusive(factory: SqlAlchemyUnitOfWorkFactory) -> None:
    async with factory() as writer:
        await writer.payroll_input_lock.lock_exclusive()
        await writer.commit()


@pytest.mark.anyio
async def test_period_row_lock_waits_for_exclusive_payroll_input_writer(
    stage10_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    factory = SqlAlchemyUnitOfWorkFactory(stage10_session_factory)
    suffix = uuid4().hex
    year = 2000 + int(suffix[:2], 16) % 101
    month = 1 + int(suffix[2:4], 16) % 12
    try:
        async with factory() as hr_writer:
            await hr_writer.payroll_input_lock.lock_exclusive()
            waiting_period_writer = asyncio.create_task(_lock_period(factory, year, month))
            await asyncio.sleep(0.1)
            assert not waiting_period_writer.done(), "period lock must acquire shared gate first"
        await asyncio.wait_for(waiting_period_writer, timeout=3)
    finally:
        async with stage10_session_factory() as cleanup:
            await cleanup.execute(
                delete(PayrollPeriod).where(
                    PayrollPeriod.year == year, PayrollPeriod.month == month
                )
            )
            await cleanup.commit()


async def _lock_period(factory: SqlAlchemyUnitOfWorkFactory, year: int, month: int) -> None:
    async with factory() as period_writer:
        await period_writer.payroll_periods.lock_period(year, month)
        await period_writer.commit()
