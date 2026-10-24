from __future__ import annotations

import httpx
import pytest

from app.api.dependencies import get_authenticated_context
from app.core.config import Settings
from app.core.context import Actor, RequestContext
from app.domain.auth.rules import AccessContext
from app.main import create_app


@pytest.mark.anyio
async def test_manual_notification_processors_require_user_update_permission() -> None:
    app = create_app(Settings(otel_enabled=False))
    actor = Actor(
        actor_id="stage13-employee",
        is_authenticated=True,
        access=AccessContext("stage13-employee", None, None, (), ()),
    )
    context = RequestContext("stage13-permission-test", actor=actor)
    app.dependency_overrides[get_authenticated_context] = lambda: context

    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            smtp = await client.post("/api/notifications/smtp/process")
            alerts = await client.post("/api/notifications/generate-alerts")

    assert smtp.status_code == 403
    assert alerts.status_code == 403
