from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from tests.database import test_database_url as resolve_test_database_url


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(scope="session")
def test_database_url() -> str:
    return resolve_test_database_url()


@pytest.fixture
async def db_engine(test_database_url: str) -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(test_database_url, echo=False, hide_parameters=True)
    try:
        async with engine.connect() as connection:
            if (
                await connection.scalar(text("SELECT current_database()"))
                != "organization_erp_test"
            ):
                raise ValueError(
                    "Integration tests connected to a database other than organization_erp_test"
                )
        yield engine
    finally:
        await engine.dispose()


@pytest.fixture
def db_session_factory(db_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(db_engine, expire_on_commit=False)


pytest_plugins = ["tests.auth_support", "tests.organization_support"]
