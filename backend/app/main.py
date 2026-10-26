from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.trace import TracerProvider

from app.api.errors import install_error_handlers
from app.api.router import api_router
from app.core.config import Settings
from app.core.container import AppResources
from app.core.logging import configure_logging
from app.core.metrics import (
    create_database_metric_instruments,
    create_http_metric_instruments,
    install_sqlalchemy_observability,
    record_pool_wait,
)
from app.core.middleware import RequestContextMiddleware
from app.core.observability import create_observability
from app.db.session import create_engine, create_session_factory
from app.db.uow import create_unit_of_work_factory
from app.integrations.document_rendering import DocumentRenderer
from app.integrations.document_storage import LocalDocumentStorage
from app.integrations.smtp import verify_smtp

logger = logging.getLogger(__name__)


async def _shutdown_observability_provider(
    provider: TracerProvider | MeterProvider, timeout_seconds: float
) -> None:
    try:
        async with asyncio.timeout(timeout_seconds):
            await asyncio.to_thread(provider.shutdown)
    except TimeoutError:
        logger.warning("OpenTelemetry provider shutdown exceeded its configured deadline")


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or Settings()
    configure_logging()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = create_engine(resolved_settings)
        session_factory = create_session_factory(engine)
        observability = create_observability(resolved_settings)
        http_metric_instruments = create_http_metric_instruments(observability.meter)
        database_metric_instruments = create_database_metric_instruments(observability.meter)
        unit_of_work_factory = create_unit_of_work_factory(
            session_factory,
            observability.tracer,
            lambda duration, outcome: record_pool_wait(
                database_metric_instruments, duration, outcome
            ),
        )
        install_sqlalchemy_observability(engine, observability.tracer, database_metric_instruments)
        resources = AppResources(
            engine=engine,
            session_factory=session_factory,
            unit_of_work_factory=unit_of_work_factory,
            smtp_verifier=verify_smtp,
            tracer_provider=observability.tracer_provider,
            meter_provider=observability.meter_provider,
            tracer=observability.tracer,
            meter=observability.meter,
            http_metric_instruments=http_metric_instruments,
            database_metric_instruments=database_metric_instruments,
        )
        app.state.engine = resources.engine
        app.state.session_factory = resources.session_factory
        app.state.unit_of_work_factory = resources.unit_of_work_factory
        app.state.smtp_verifier = resources.smtp_verifier
        app.state.tracer_provider = resources.tracer_provider
        app.state.meter_provider = resources.meter_provider
        app.state.tracer = resources.tracer
        app.state.meter = resources.meter
        app.state.http_metric_instruments = resources.http_metric_instruments
        app.state.database_metric_instruments = resources.database_metric_instruments
        try:
            yield
        finally:
            try:
                if resources.meter_provider is not None:
                    await _shutdown_observability_provider(
                        resources.meter_provider,
                        resolved_settings.otel_shutdown_timeout_seconds,
                    )
            finally:
                try:
                    if resources.tracer_provider is not None:
                        await _shutdown_observability_provider(
                            resources.tracer_provider,
                            resolved_settings.otel_shutdown_timeout_seconds,
                        )
                finally:
                    try:
                        app.state.document_storage.close()
                    finally:
                        await resources.engine.dispose()

    docs_enabled = resolved_settings.environment != "production"
    app = FastAPI(
        title="Organization ERP API",
        version="0.1.0",
        openapi_url="/openapi.json",
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        lifespan=lifespan,
    )
    app.state.settings = resolved_settings
    app.state.document_storage = LocalDocumentStorage(resolved_settings.document_storage_root)
    app.state.document_rendering = DocumentRenderer()
    app.add_middleware(RequestContextMiddleware)
    app.include_router(api_router)
    install_error_handlers(app)
    return app
