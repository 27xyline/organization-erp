from types import SimpleNamespace

import httpx
import pytest

from app.api.dependencies import (
    get_authenticated_context,
    get_dashboard_service,
    get_my_actions_service,
)
from app.core.context import Actor, RequestContext
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.main import create_app


@pytest.mark.anyio
async def test_dashboard_and_my_actions_responses_use_data_envelopes() -> None:
    app = create_app()
    from opentelemetry import trace

    app.state.tracer = trace.get_tracer(__name__)
    access = AccessContext(
        "my-actions-user", None, None, (), (ScopeGrant("admin", "ADMIN", "ALL", "ALL"),)
    )
    context = RequestContext(
        request_id="my-actions-contract",
        actor=Actor(actor_id="my-actions-user", is_authenticated=True, access=access),
    )
    dashboard_result = {"summary": {"headcount": 0}}
    actions_result = {"items": [], "summary": {"count": 0}}

    async def get_dashboard(query, actor_access):
        assert actor_access is access
        return dashboard_result

    async def get_my_actions(actor_id, employee_id, actor_access):
        assert actor_id == "my-actions-user"
        assert actor_access is access
        return actions_result

    app.dependency_overrides[get_authenticated_context] = lambda: context
    app.dependency_overrides[get_dashboard_service] = lambda: SimpleNamespace(
        get_overview=get_dashboard
    )
    app.dependency_overrides[get_my_actions_service] = lambda: SimpleNamespace(
        get_for_user=get_my_actions
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        actions_response = await client.get("/api/my-actions")
        dashboard_response = await client.get("/api/dashboard")

    assert actions_response.status_code == 200
    assert actions_response.json() == {"data": actions_result}
    assert dashboard_response.status_code == 200
    assert dashboard_response.json() == {"data": dashboard_result}
