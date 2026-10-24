from __future__ import annotations

import os
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.registry import Base


@pytest.fixture
async def stage11_session_factory() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    database_url = os.environ.get("STAGE11_TEST_DATABASE_URL")
    if not database_url:
        pytest.fail("Stage11 PostgreSQL tests require STAGE11_TEST_DATABASE_URL")
    url = make_url(database_url)
    if url.get_backend_name() != "postgresql" or url.database != "erp_stage11_test":
        pytest.fail("Stage11 tests are restricted to the erp_stage11_test PostgreSQL database")
    engine = create_async_engine(url, echo=False, hide_parameters=True)
    try:
        async with engine.begin() as connection:
            current_database = await connection.scalar(text("SELECT current_database()"))
            if current_database != "erp_stage11_test":
                pytest.fail("Stage11 tests connected to a non-Stage11 database")
            await connection.run_sync(Base.metadata.create_all)
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()
