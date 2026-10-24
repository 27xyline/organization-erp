from __future__ import annotations

from dataclasses import dataclass

from opentelemetry import metrics, trace
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import MetricReader, PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SpanExporter

from app.core.config import Settings


@dataclass(slots=True)
class ObservabilityRuntime:
    tracer_provider: TracerProvider | None
    meter_provider: MeterProvider | None
    tracer: trace.Tracer
    meter: metrics.Meter


def _signal_endpoint(endpoint: str, signal: str) -> str:
    normalized = endpoint.rstrip("/")
    for suffix in ("/v1/traces", "/v1/metrics"):
        if normalized.endswith(suffix):
            normalized = normalized.removesuffix(suffix)
            break
    return f"{normalized}/v1/{signal}"


def create_tracer_provider(settings: Settings) -> TracerProvider | None:
    if not settings.otel_enabled:
        return None
    provider = TracerProvider(resource=Resource.create({"service.name": settings.service_name}))
    exporter = OTLPSpanExporter(
        endpoint=_signal_endpoint(settings.otel_exporter_otlp_endpoint, "traces"),
        timeout=settings.otel_export_timeout_seconds,
    )
    provider.add_span_processor(BatchSpanProcessor(exporter))
    return provider


def get_tracer(provider: TracerProvider | None, service_name: str) -> trace.Tracer:
    if provider is not None:
        return provider.get_tracer(service_name)
    return trace.get_tracer(service_name)


def create_observability(
    settings: Settings,
    service_name: str | None = None,
    *,
    span_exporter: SpanExporter | None = None,
    metric_reader: MetricReader | None = None,
) -> ObservabilityRuntime:
    resolved_service_name = service_name or settings.service_name
    if not settings.otel_enabled:
        return ObservabilityRuntime(
            tracer_provider=None,
            meter_provider=None,
            tracer=trace.get_tracer(resolved_service_name),
            meter=metrics.get_meter(resolved_service_name),
        )

    resource = Resource.create({"service.name": resolved_service_name})
    tracer_provider = TracerProvider(resource=resource)
    resolved_span_exporter = span_exporter or OTLPSpanExporter(
        endpoint=_signal_endpoint(settings.otel_exporter_otlp_endpoint, "traces"),
        timeout=settings.otel_export_timeout_seconds,
    )
    tracer_provider.add_span_processor(BatchSpanProcessor(resolved_span_exporter))

    resolved_metric_reader = metric_reader or PeriodicExportingMetricReader(
        OTLPMetricExporter(
            endpoint=_signal_endpoint(settings.otel_exporter_otlp_endpoint, "metrics"),
            timeout=settings.otel_export_timeout_seconds,
        ),
        export_interval_millis=15_000,
        export_timeout_millis=int(settings.otel_export_timeout_seconds * 1000),
    )
    meter_provider = MeterProvider(resource=resource, metric_readers=[resolved_metric_reader])
    return ObservabilityRuntime(
        tracer_provider=tracer_provider,
        meter_provider=meter_provider,
        tracer=tracer_provider.get_tracer(resolved_service_name),
        meter=meter_provider.get_meter(resolved_service_name),
    )
