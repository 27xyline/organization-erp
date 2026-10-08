from __future__ import annotations

import httpx
import pytest
from fastapi import Request

from app.core.config import Settings
from app.domain.errors import DomainError
from app.main import create_app


@pytest.mark.anyio
async def test_validation_errors_include_standard_envelope_and_request_id() -> None:
    app = create_app(Settings(otel_enabled=False))
    async with app.router.lifespan_context(app):

        @app.get("/api/test/needs-int")
        async def needs_int(value: int) -> dict[str, int]:
            return {"value": value}

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/test/needs-int", params={"value": "bad"})

    assert response.status_code == 422
    assert response.headers["x-request-id"]
    assert response.json()["error"]["code"] == "validation_error"
    assert response.json()["error"]["message"] == "Request validation failed"
    assert "bad" not in response.text


@pytest.mark.anyio
async def test_domain_errors_use_standard_envelope() -> None:
    app = create_app(Settings(otel_enabled=False))
    async with app.router.lifespan_context(app):

        @app.get("/api/test/domain-error")
        async def domain_error(request: Request) -> None:
            raise DomainError(code="conflict", message="Operation cannot be completed")

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/test/domain-error", headers={"x-request-id": "request-123"}
            )

    assert response.status_code == 409
    assert response.headers["x-request-id"] == "request-123"
    assert response.json() == {
        "error": {"code": "conflict", "message": "Operation cannot be completed"}
    }


@pytest.mark.anyio
async def test_missing_route_uses_standard_error_envelope() -> None:
    app = create_app(Settings(otel_enabled=False))
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/missing", headers={"x-request-id": "client-id"})

    assert response.status_code == 404
    assert response.headers["x-request-id"] == "client-id"
    assert response.json()["error"]["code"] == "not_found"


@pytest.mark.anyio
async def test_traceparent_is_propagated_to_response() -> None:
    app = create_app(Settings(otel_enabled=False))
    traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/health/live", headers={"traceparent": traceparent})

    assert response.headers["traceparent"] == traceparent


@pytest.mark.anyio
async def test_unexpected_errors_hide_details_from_the_response() -> None:
    app = create_app(Settings(otel_enabled=False))
    async with app.router.lifespan_context(app):

        @app.get("/api/test/unexpected")
        async def unexpected() -> None:
            raise RuntimeError("private database detail")

        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/test/unexpected")

    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "internal_error", "message": "An unexpected error occurred"}
    }
    assert response.headers["x-request-id"]
    assert "private database detail" not in response.text


def test_production_disables_interactive_docs_and_keeps_openapi() -> None:
    app = create_app(Settings(environment="production", otel_enabled=False))
    route_paths = {getattr(route, "path", None) for route in app.routes}

    assert "/docs" not in route_paths
    assert "/redoc" not in route_paths
    assert "/openapi.json" in route_paths
