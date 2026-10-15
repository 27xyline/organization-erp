from __future__ import annotations

import os

import httpx
import pytest
from opentelemetry import trace
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import Settings
from app.main import create_app


async def request_with_lifespan(app: object, path: str) -> httpx.Response:
    async with app.router.lifespan_context(app):  # type: ignore[attr-defined]
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.get(path)


@pytest.mark.anyio
async def test_liveness_does_not_depend_on_database() -> None:
    settings = Settings(
        database_url="postgresql://127.0.0.1:1/erp",
        environment="test",
        otel_enabled=False,
    )
    response = await request_with_lifespan(create_app(settings), "/api/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.anyio
async def test_readiness_returns_503_when_database_is_unavailable() -> None:
    settings = Settings(
        database_url="postgresql://127.0.0.1:1/erp",
        environment="test",
        db_connect_timeout_seconds=0.2,
        db_readiness_timeout_seconds=0.4,
        otel_enabled=False,
    )
    response = await request_with_lifespan(create_app(settings), "/api/health/ready")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}


@pytest.mark.anyio
async def test_readiness_queries_dedicated_postgres_database() -> None:
    database_url = os.environ.get("BACKEND_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("BACKEND_TEST_DATABASE_URL is not configured")

    parsed_url = make_url(database_url)
    assert parsed_url.get_backend_name() == "postgresql"
    assert parsed_url.database in {
        "erp_stage01_test",
        "erp_stage02_test",
        "erp_stage03_test",
        "erp_stage04_test",
        "erp_stage05_test",
        "erp_stage06_test",
        "erp_stage00_test_20261007",
    }

    settings = Settings(database_url=database_url, environment="test", otel_enabled=False)
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        engine: AsyncEngine = app.state.engine
        async with engine.connect() as connection:
            database_name = await connection.scalar(text("SELECT current_database()"))
        assert database_name == parsed_url.database

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.anyio
async def test_lifespan_disposes_engine() -> None:
    app = create_app(Settings(otel_enabled=False))
    async with app.router.lifespan_context(app):
        engine: AsyncEngine = app.state.engine
        original_pool = engine.pool
        assert engine.sync_engine.hide_parameters is True
        assert engine.pool.checkedout() == 0

    assert engine.pool.checkedout() == 0
    assert engine.pool is not original_pool


@pytest.mark.anyio
async def test_collector_outage_does_not_break_startup_or_requests() -> None:
    settings = Settings(
        database_url="postgresql://127.0.0.1:1/erp",
        environment="test",
        otel_enabled=True,
        otel_exporter_otlp_endpoint="http://127.0.0.1:1",
        otel_export_timeout_seconds=0.1,
    )
    response = await request_with_lifespan(create_app(settings), "/api/health/live")

    assert response.status_code == 200


@pytest.mark.anyio
async def test_app_instances_own_independent_tracer_providers() -> None:
    global_provider = trace.get_tracer_provider()
    telemetry_settings = Settings(
        otel_enabled=True, otel_exporter_otlp_endpoint="http://127.0.0.1:1"
    )
    first = create_app(telemetry_settings)
    second = create_app(telemetry_settings)
    async with first.router.lifespan_context(first):
        first_provider = first.state.tracer_provider
        async with second.router.lifespan_context(second):
            assert second.state.tracer_provider is not first_provider
    assert trace.get_tracer_provider() is global_provider
