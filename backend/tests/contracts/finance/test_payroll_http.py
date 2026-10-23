from __future__ import annotations

import httpx
import pytest

from app.api.dependencies import get_authenticated_context
from app.api.routes.payroll import get_payroll_period_service, get_payroll_service
from app.core.context import Actor, RequestContext
from app.main import create_app


class _PayrollService:
    async def get_month(self, year: int, month: int, context: RequestContext):
        return {"rows": [{"gross": 100.25}], "totals": {"gross": 100.25}}

    async def create_adjustment(self, value, context: RequestContext):
        return {"id": "s10-adjustment", "amount": 12.5, "description": "Bonus"}

    async def remove_adjustment(self, identifier: str, context: RequestContext):
        return None


class _PayrollPeriodService:
    async def set_status(
        self, year: int, month: int, status: str, context: RequestContext, reason: str | None = None
    ):
        return {
            "year": year,
            "month": month,
            "status": status,
            "closedById": context.actor.actor_id,
        }


@pytest.mark.anyio
async def test_payroll_http_routes_keep_legacy_data_envelopes_and_status_codes() -> None:
    app = create_app()
    from opentelemetry import trace

    app.state.tracer = trace.get_tracer(__name__)
    context = RequestContext(
        request_id="payroll-contract",
        actor=Actor(actor_id="s10-admin", is_authenticated=True),
    )
    app.dependency_overrides[get_authenticated_context] = lambda: context
    app.dependency_overrides[get_payroll_service] = _PayrollService
    app.dependency_overrides[get_payroll_period_service] = _PayrollPeriodService
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        month = await client.get("/api/payroll?year=2026&month=10")
        adjustment = await client.post(
            "/api/payroll",
            json={
                "employeeId": f"c{'1' * 24}",
                "year": 2026,
                "month": 10,
                "type": "BONUS",
                "amount": 12.5,
                "description": "Bonus",
            },
        )
        deleted = await client.delete("/api/payroll/adjustments/s10-adjustment")
        closed = await client.put(
            "/api/payroll/period", json={"year": 2026, "month": 10, "status": "CLOSED"}
        )

    assert month.json() == {"data": {"rows": [{"gross": 100.25}], "totals": {"gross": 100.25}}}
    assert adjustment.status_code == 201
    assert adjustment.json() == {
        "data": {"id": "s10-adjustment", "amount": 12.5, "description": "Bonus"}
    }
    assert deleted.json() == {"data": {"success": True}}
    assert closed.json() == {
        "data": {"year": 2026, "month": 10, "status": "CLOSED", "closedById": "s10-admin"}
    }
