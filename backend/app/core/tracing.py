from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from opentelemetry.trace import Span, SpanKind, Status, StatusCode, Tracer


@asynccontextmanager
async def trace_async_operation(tracer: Tracer, name: str) -> AsyncIterator[Span]:
    with tracer.start_as_current_span(
        name,
        kind=SpanKind.INTERNAL,
        record_exception=False,
        set_status_on_exception=False,
    ) as span:
        try:
            yield span
        except Exception:
            span.set_status(Status(StatusCode.ERROR))
            raise
