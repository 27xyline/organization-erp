from __future__ import annotations

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from app.core.config import Settings


def create_tracer_provider(settings: Settings) -> TracerProvider | None:
    if not settings.otel_enabled:
        return None
    provider = TracerProvider(resource=Resource.create({"service.name": settings.service_name}))
    endpoint = settings.otel_exporter_otlp_endpoint.rstrip("/")
    if not endpoint.endswith("/v1/traces"):
        endpoint += "/v1/traces"
    exporter = OTLPSpanExporter(endpoint=endpoint, timeout=settings.otel_export_timeout_seconds)
    provider.add_span_processor(BatchSpanProcessor(exporter))
    return provider


def get_tracer(provider: TracerProvider | None, service_name: str) -> trace.Tracer:
    if provider is not None:
        return provider.get_tracer(service_name)
    return trace.get_tracer(service_name)
