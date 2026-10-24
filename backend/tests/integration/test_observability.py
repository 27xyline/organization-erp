from __future__ import annotations

import httpx
import pytest
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import InMemoryMetricReader
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from sqlalchemy import text

from app.core.config import Settings
from app.core.metrics import (
    create_database_metric_instruments,
    create_http_metric_instruments,
    install_sqlalchemy_observability,
)
from app.main import create_app


@pytest.mark.anyio
async def test_http_metrics_and_trace_use_safe_route_metadata() -> None:
    app = create_app(
        Settings(
            database_url="postgresql://127.0.0.1:1/erp",
            db_connect_timeout_seconds=0.1,
            db_readiness_timeout_seconds=0.2,
            otel_enabled=False,
        )
    )
    span_exporter = InMemorySpanExporter()
    tracer_provider = TracerProvider()
    tracer_provider.add_span_processor(SimpleSpanProcessor(span_exporter))
    metric_reader = InMemoryMetricReader()
    meter_provider = MeterProvider(metric_readers=[metric_reader])

    async with app.router.lifespan_context(app):
        app.state.tracer = tracer_provider.get_tracer("observability-test")
        app.state.http_metric_instruments = create_http_metric_instruments(
            meter_provider.get_meter("observability-test")
        )
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/health/live",
                headers={
                    "x-request-id": "observability-test-request",
                    "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
                },
            )
            readiness_response = await client.get("/api/health/ready")
        assert response.status_code == 200
        assert readiness_response.status_code == 503

        metric_data = metric_reader.get_metrics_data()
        assert metric_data is not None
        http_metrics = {
            metric.name: metric
            for resource in metric_data.resource_metrics
            for scope in resource.scope_metrics
            for metric in scope.metrics
        }
        request_points = http_metrics["erp_http_requests_total"].data.data_points
        assert {point.attributes["http.response.status_code"] for point in request_points} == {
            200,
            503,
        }
        live_point = next(
            point
            for point in request_points
            if point.attributes["http.response.status_code"] == 200
        )
        assert live_point.value == 1
        assert live_point.attributes == {
            "http.route": "/health/live",
            "http.request.method": "GET",
            "http.response.status_code": 200,
        }
        spans = span_exporter.get_finished_spans()
        request_span = next(
            span
            for span in spans
            if span.kind.name == "SERVER" and span.attributes.get("http.route") == "/health/live"
        )
        assert request_span.attributes["http.route"] == "/health/live"
        assert request_span.attributes["http.request.method"] == "GET"
        assert request_span.attributes["http.response.status_code"] == 200
        assert request_span.parent is not None
        assert request_span.parent.span_id == 0x00F067AA0BA902B7

    meter_provider.shutdown()
    tracer_provider.shutdown()


@pytest.mark.anyio
async def test_sql_metrics_and_spans_exclude_statement_and_bind_values(db_engine) -> None:
    reader = InMemoryMetricReader()
    meter_provider = MeterProvider(metric_readers=[reader])
    tracer_provider = TracerProvider()
    span_exporter = InMemorySpanExporter()
    tracer_provider.add_span_processor(SimpleSpanProcessor(span_exporter))
    instruments = create_database_metric_instruments(meter_provider.get_meter("sql-test"))
    install_sqlalchemy_observability(db_engine, tracer_provider.get_tracer("sql-test"), instruments)

    async with db_engine.connect() as connection:
        result = await connection.execute(
            text("SELECT :private_value AS value"),
            {"private_value": "employee@example.test"},
        )
        assert result.scalar_one() == "employee@example.test"

    assert meter_provider.force_flush()
    metric_data = reader.get_metrics_data()
    assert metric_data is not None
    query_metric = next(
        metric
        for resource in metric_data.resource_metrics
        for scope in resource.scope_metrics
        for metric in scope.metrics
        if metric.name == "erp_db_queries_total"
    )
    query_point = query_metric.data.data_points[0]
    assert query_point.value == 1
    assert query_point.attributes == {
        "db.system.name": "postgresql",
        "db.operation.name": "SELECT",
        "outcome": "success",
    }
    spans = span_exporter.get_finished_spans()
    assert len(spans) == 1
    assert spans[0].name == "db.select"
    assert spans[0].attributes == {
        "db.system": "postgresql",
        "db.system.name": "postgresql",
        "db.operation.name": "SELECT",
    }
    assert "employee@example.test" not in str(spans[0].attributes)
    meter_provider.shutdown()
    tracer_provider.shutdown()


@pytest.mark.anyio
async def test_api_readiness_is_independent_of_unavailable_collector(stage02_database_url) -> None:
    app = create_app(
        Settings(
            database_url=stage02_database_url,
            otel_enabled=True,
            otel_exporter_otlp_endpoint="http://127.0.0.1:1",
            otel_export_timeout_seconds=0.1,
            otel_shutdown_timeout_seconds=0.5,
        )
    )

    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            live = await client.get("/api/health/live")
            ready = await client.get("/api/health/ready")

    assert live.status_code == 200
    assert ready.status_code == 200
