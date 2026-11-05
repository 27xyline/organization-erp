"""Контракт общей доски задач."""

import httpx
import pytest
from opentelemetry import trace

from app.api.dependencies import get_authenticated_context
from app.api.routes.tasks import get_service
from app.core.context import Actor, RequestContext
from app.domain.auth.rules import AccessContext
from app.main import create_app


@pytest.mark.anyio
async def test_shared_tasks_route_lists_tasks_for_current_actor():
    actor = Actor(
        "employee-user",
        is_authenticated=True,
        employee_id="employee",
        access=AccessContext("employee-user", "employee", None, (), ()),
    )
    context = RequestContext("request", actor=actor)

    class Service:
        async def inbox(self, actual_actor):
            assert actual_actor == actor
            return ()

    app = create_app()
    app.state.tracer = trace.get_tracer(__name__)
    app.dependency_overrides[get_authenticated_context] = lambda: context
    app.dependency_overrides[get_service] = lambda: Service()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/api/tasks")
    assert response.status_code == 200
    assert response.json() == {"data": []}
