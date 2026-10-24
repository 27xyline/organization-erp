from types import SimpleNamespace

from app.core.metric_attributes import (
    http_metric_attributes,
    http_route_template,
    http_span_attributes,
    normalize_http_method,
    sql_operation,
)


def test_http_attributes_use_route_templates_and_bounded_methods() -> None:
    route = SimpleNamespace(path="/api/employees/{employee_id}")

    assert http_metric_attributes("GET", route, 200) == {
        "http.route": "/api/employees/{employee_id}",
        "http.request.method": "GET",
        "http.response.status_code": 200,
    }
    assert http_metric_attributes("new-unique-method", route, 900)["http.request.method"] == "OTHER"
    assert http_metric_attributes("GET", route, 900)["http.response.status_code"] == 500


def test_unmatched_request_path_is_not_used_as_a_metric_label() -> None:
    assert http_route_template("/api/employees/private-person-id") == "unmatched"


def test_span_compatibility_attributes_remain_bounded() -> None:
    attributes = http_span_attributes("GET", SimpleNamespace(path="/api/health/live"), 200)

    assert attributes["http.route"] == "/api/health/live"
    assert attributes["http.method"] == "GET"
    assert attributes["http.status_code"] == 200
    assert normalize_http_method("OPTIONS") == "OPTIONS"


def test_sql_operation_does_not_return_query_text_or_values() -> None:
    assert sql_operation("SELECT employee.email FROM employees WHERE id = 'private'") == "SELECT"
    assert sql_operation("WITH private_data AS (SELECT 1) SELECT * FROM private_data") == "OTHER"
    assert sql_operation("") == "OTHER"
