from app.core.config import Settings
from app.main import create_app


def test_stage09_routes_are_registered() -> None:
    routes = create_app(Settings(otel_enabled=False)).openapi()["paths"]

    assert "/api/approvals" in routes
    assert set(routes["/api/approvals"]) >= {"get", "post"}
    assert "/api/notifications" in routes
