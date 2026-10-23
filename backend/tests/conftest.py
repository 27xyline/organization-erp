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
    stage10_url = os.environ.get("STAGE10_TEST_DATABASE_URL")
    stage09_url = os.environ.get("STAGE09_TEST_DATABASE_URL")
    stage08_url = os.environ.get("STAGE08_TEST_DATABASE_URL")
    stage07_url = os.environ.get("STAGE07_TEST_DATABASE_URL")
    stage06_url = os.environ.get("STAGE06_TEST_DATABASE_URL")
    stage02_url = os.environ.get("STAGE02_TEST_DATABASE_URL")
    stage03_url = os.environ.get("STAGE03_TEST_DATABASE_URL")
    stage05_url = os.environ.get("STAGE05_TEST_DATABASE_URL")
    stage04_url = os.environ.get("STAGE04_TEST_DATABASE_URL")
    database_url = (
        stage10_url
        or stage09_url
        or stage08_url
        or stage07_url
        or stage06_url
        or stage05_url
        or stage04_url
        or stage03_url
        or stage02_url
    )
    if not database_url:
        pytest.fail(
            "STAGE10_TEST_DATABASE_URL, STAGE02_TEST_DATABASE_URL, "
            "STAGE03_TEST_DATABASE_URL, STAGE04_TEST_DATABASE_URL, "
            "STAGE05_TEST_DATABASE_URL, or STAGE06_TEST_DATABASE_URL "
            "or STAGE07_TEST_DATABASE_URL or STAGE08_TEST_DATABASE_URL must point "
            "to an isolated PostgreSQL DB"
        )
    parsed_url = make_url(database_url)
    expected_database = (
        "erp_stage10_test"
        if stage10_url
        else "erp_stage09_test"
        if stage09_url
        else
        "erp_stage08_test"
        if stage08_url
        else "erp_stage07_test"
        if stage07_url
        else "erp_stage06_test"
        if stage06_url
        else "erp_stage05_test"
        if stage05_url
        else "erp_stage04_test"
        if stage04_url
        else "erp_stage03_test"
        if stage03_url
        else "erp_stage02_test"
    )
    if parsed_url.get_backend_name() != "postgresql" or parsed_url.database != expected_database:
        pytest.fail(
            f"Integration tests are restricted to the {expected_database} PostgreSQL database"
        )
    if parsed_url.drivername in {"postgresql", "postgresql+psycopg"}:
        return parsed_url.set(drivername="postgresql+asyncpg").render_as_string(hide_password=False)
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


pytest_plugins = ["tests.auth_support", "tests.stage04_support"]
