from __future__ import annotations

from unittest.mock import AsyncMock, Mock

import pytest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from app.db.uow import SqlAlchemyUnitOfWork


@pytest.mark.anyio
async def test_uow_creates_service_span_and_records_connection_acquisition() -> None:
    session = Mock()
    session.begin = AsyncMock()
    session.connection = AsyncMock()
    session.rollback = AsyncMock()
    session.close = AsyncMock()
    session_factory = Mock(return_value=session)
    span_exporter = InMemorySpanExporter()
    tracer_provider = TracerProvider()
    tracer_provider.add_span_processor(SimpleSpanProcessor(span_exporter))
    pool_waits: list[tuple[float, str]] = []

    async with SqlAlchemyUnitOfWork(
        session_factory,
        tracer_provider.get_tracer("uow-test"),
        lambda duration, outcome: pool_waits.append((duration, outcome)),
    ):
        pass

    assert session.connection.await_count == 1
    assert len(pool_waits) == 1
    assert pool_waits[0][0] >= 0
    assert pool_waits[0][1] == "success"
    spans = span_exporter.get_finished_spans()
    assert len(spans) == 1
    assert spans[0].name == "service.operation"
    assert spans[0].status.status_code.name == "UNSET"
    tracer_provider.shutdown()
