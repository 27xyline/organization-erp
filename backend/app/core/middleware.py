from __future__ import annotations

import re
import time
from uuid import uuid4

from opentelemetry import propagate
from opentelemetry.trace import SpanKind, Status, StatusCode
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.context import RequestContext, reset_request_context, set_request_context
from app.core.metric_attributes import http_span_attributes
from app.core.metrics import HttpMetricInstruments, record_http_request
from app.integrations.session_security import (
    CSRF_COOKIE_NAME,
    CSRF_HEADER_NAME,
    SESSION_COOKIE_NAME,
    validate_csrf_request,
)

_REQUEST_ID = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
_TRACEPARENT = re.compile(r"^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$")


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        supplied_id = request.headers.get("x-request-id", "")
        request_id = supplied_id if _REQUEST_ID.fullmatch(supplied_id) else str(uuid4())
        supplied_traceparent = request.headers.get("traceparent", "")
        traceparent = supplied_traceparent if _TRACEPARENT.fullmatch(supplied_traceparent) else None
        context = RequestContext(request_id=request_id, traceparent=traceparent)
        request.state.request_context = context
        token = set_request_context(context)
        try:
            parent_context = (
                propagate.extract({"traceparent": traceparent}) if traceparent else None
            )
            tracer = request.app.state.tracer
            if parent_context is None:
                span_manager = tracer.start_as_current_span("http.request", kind=SpanKind.SERVER)
            else:
                span_manager = tracer.start_as_current_span(
                    "http.request", context=parent_context, kind=SpanKind.SERVER
                )
            started_at = time.perf_counter()
            status_code = 500
            with span_manager as span:
                span.set_attribute("http.request_id", request_id)
                try:
                    settings = request.app.state.settings
                    csrf_configured = settings.csrf_secret
                    csrf_secret = (
                        csrf_configured.get_secret_value() if csrf_configured else ""
                    )
                    unsafe = request.method.upper() not in {"GET", "HEAD", "OPTIONS", "TRACE"}
                    csrf_required = request.url.path in {
                        "/api/auth/login",
                        "/api/auth/logout",
                    } or (unsafe and SESSION_COOKIE_NAME in request.cookies)
                    response: Response
                    csrf_unavailable = csrf_required and (
                        len(csrf_secret.encode()) < 32
                        or csrf_secret
                        in {
                            settings.bridge_secret.get_secret_value()
                            if settings.bridge_secret
                            else "",
                            settings.internal_auth_secret.get_secret_value()
                            if settings.internal_auth_secret
                            else "",
                        }
                    )
                    csrf_valid = not csrf_required or validate_csrf_request(
                        request.cookies.get(CSRF_COOKIE_NAME, ""),
                        request.headers.get(CSRF_HEADER_NAME, ""),
                        csrf_secret,
                        request.headers.get("origin"),
                        settings.public_origin,
                    )
                    if csrf_unavailable:
                        response = JSONResponse(
                            {
                                "error": {
                                    "code": "AUTH_UNAVAILABLE",
                                    "message": "Сервис авторизации недоступен",
                                }
                            },
                            status_code=503,
                        )
                    elif csrf_required and not csrf_valid:
                        response = JSONResponse(
                            {
                                "error": {
                                    "code": "CSRF_INVALID",
                                    "message": "Запрос не прошёл проверку безопасности",
                                }
                            },
                            status_code=403,
                        )
                    else:
                        response = await call_next(request)
                    status_code = response.status_code
                except Exception:
                    status_code = 500
                    span.set_status(Status(StatusCode.ERROR))
                    raise
                finally:
                    route = request.scope.get("route")
                    span.set_attributes(http_span_attributes(request.method, route, status_code))
                    if status_code >= 500:
                        span.set_status(Status(StatusCode.ERROR))
                    instruments = getattr(request.app.state, "http_metric_instruments", None)
                    if isinstance(instruments, HttpMetricInstruments):
                        record_http_request(
                            instruments,
                            request.method,
                            route,
                            status_code,
                            time.perf_counter() - started_at,
                        )
            response.headers["x-request-id"] = request_id
            if traceparent:
                response.headers["traceparent"] = traceparent
            else:
                carrier: dict[str, str] = {}
                propagate.inject(carrier)
                if carrier.get("traceparent"):
                    response.headers["traceparent"] = carrier["traceparent"]
            return response
        finally:
            reset_request_context(token)
