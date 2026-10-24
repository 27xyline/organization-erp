from __future__ import annotations

import re
from typing import Any

_ROUTE_TEMPLATE = re.compile(r"^/[A-Za-z0-9_./{}:-]*$")
_HTTP_METHODS = frozenset(
    {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "CONNECT", "TRACE"}
)
_SQL_OPERATIONS = frozenset({"SELECT", "INSERT", "UPDATE", "DELETE", "MERGE", "CALL"})


def http_route_template(route: object) -> str:
    """Return a registered route template, never a raw request path."""
    value = getattr(route, "path", None)
    if isinstance(value, str) and _ROUTE_TEMPLATE.fullmatch(value):
        return value
    return "unmatched"


def normalize_http_method(method: str) -> str:
    normalized = method.upper()
    return normalized if normalized in _HTTP_METHODS else "OTHER"


def http_metric_attributes(method: str, route: object, status_code: int) -> dict[str, Any]:
    status = status_code if 100 <= status_code <= 599 else 500
    return {
        "http.route": http_route_template(route),
        "http.request.method": normalize_http_method(method),
        "http.response.status_code": status,
    }


def http_span_attributes(method: str, route: object, status_code: int) -> dict[str, Any]:
    attributes = http_metric_attributes(method, route, status_code)
    # Keep both semantic-convention names during the mixed TypeScript/Python phase.
    attributes["http.method"] = attributes["http.request.method"]
    attributes["http.status_code"] = attributes["http.response.status_code"]
    return attributes


def sql_operation(statement: str) -> str:
    """Extract a bounded SQL operation label without retaining query text or values."""
    first_word = statement.lstrip().split(maxsplit=1)
    operation = first_word[0].upper() if first_word else ""
    return operation if operation in _SQL_OPERATIONS else "OTHER"
