from app.core.config import Settings
from app.main import create_app


def test_payroll_period_put_route_is_registered() -> None:
    routes = create_app(Settings(_env_file=None)).openapi()["paths"]

    assert "put" in routes["/api/payroll/period"]


def test_timekeeping_workflow_routes_are_registered() -> None:
    routes = create_app(Settings(_env_file=None)).openapi()["paths"]

    assert {"get", "post"} <= set(routes["/api/time-entries"])
    assert {"put", "delete"} <= set(routes["/api/time-entries/{entry_id}"])
    assert "post" in routes["/api/timekeeping/timesheets"]
    assert "post" in routes["/api/timekeeping/timesheets/{timesheet_id}/decision"]


def test_time_entry_delete_body_remains_optional_for_legacy_callers() -> None:
    operation = create_app(Settings(_env_file=None)).openapi()["paths"][
        "/api/time-entries/{entry_id}"
    ]["delete"]

    assert operation.get("requestBody", {}).get("required", False) is False
