from __future__ import annotations

import os
from collections.abc import AsyncIterator

import pytest
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)


def _stage02_database_url() -> str:
    database_url = os.environ.get("STAGE02_TEST_DATABASE_URL")
    if not database_url:
        pytest.fail("STAGE02_TEST_DATABASE_URL must point to the isolated stage02 PostgreSQL DB")
    parsed_url = make_url(database_url)
    if parsed_url.get_backend_name() != "postgresql" or parsed_url.database != "erp_stage02_test":
        pytest.fail("Integration tests are restricted to the erp_stage02_test PostgreSQL database")
    return database_url


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(scope="session")
def stage02_database_url() -> str:
    return _stage02_database_url()


@pytest.fixture
async def db_engine(stage02_database_url: str) -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(stage02_database_url, echo=False, hide_parameters=True)
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest.fixture
def db_session_factory(db_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(db_engine, expire_on_commit=False)
