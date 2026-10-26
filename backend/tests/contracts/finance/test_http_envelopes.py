from __future__ import annotations

import httpx
import pytest

from app.api.dependencies import get_authenticated_context
from app.api.routes.finance import get_finance_service
from app.core.context import Actor, RequestContext
from app.main import create_app


class _FinanceService:
    async def get_plan_table(self, plan_type: str, year: int, context: RequestContext):
        return {"year": year, "rows": [], "projects": []}

    async def save_plan(self, value, context: RequestContext):
        return {"cell": {"amount": "12.30"}, "projects": []}

    async def clear_plan(self, value, context: RequestContext):
        return None

    async def get_salary_table(self, year: int, context: RequestContext):
        return {"year": year, "rows": [], "projects": []}

    async def get_project_payroll(self, project_id: str, year: int, context: RequestContext):
        return {"year": year, "rows": [], "summary": {"totalSalary": "0.00"}}

    async def save_project_payroll(self, project_id: str, value, context: RequestContext):
        return {"cell": {"amount": "12.30"}}

    async def clear_project_payroll(self, project_id: str, value, context: RequestContext):
        return None


@pytest.mark.anyio
async def test_finance_http_response_envelopes_match_legacy_contract() -> None:
    app = create_app()
    from opentelemetry import trace

    app.state.tracer = trace.get_tracer(__name__)
    context = RequestContext(
        request_id="finance-contract",
        actor=Actor(actor_id="finance-contract", is_authenticated=True),
    )
    app.dependency_overrides[get_authenticated_context] = lambda: context
    app.dependency_overrides[get_finance_service] = _FinanceService
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        plan = await client.get("/api/finance/plans?type=oklad&year=2026")
        saved_plan = await client.post(
            "/api/finance/plans",
            json={
                "employeeId": "e1",
                "year": 2026,
                "month": 1,
                "type": "oklad",
                "projectId": "p1",
                "amount": "12.30",
            },
        )
        deleted_plan = await client.request(
            "DELETE",
            "/api/finance/plans",
            json={"employeeId": "e1", "year": 2026, "month": 1, "type": "oklad"},
        )
        salary = await client.get("/api/finance/salary?year=2026")
        payroll = await client.get("/api/projects/p1/payroll?year=2026")
        saved_payroll = await client.put(
            "/api/projects/p1/payroll",
            json={"employeeId": "e1", "year": 2026, "month": 1, "okladEnabled": True},
        )
        deleted_payroll = await client.request(
            "DELETE",
            "/api/projects/p1/payroll",
            json={"employeeId": "e1", "year": 2026, "month": 1},
        )

    assert plan.json() == {"year": 2026, "rows": [], "projects": []}
    assert saved_plan.json() == {"success": True, "cell": {"amount": "12.30"}, "projects": []}
    assert deleted_plan.json() == {"success": True}
    assert salary.json() == {"data": {"year": 2026, "rows": [], "projects": []}}
    assert payroll.json() == {"year": 2026, "rows": [], "summary": {"totalSalary": "0.00"}}
    assert saved_payroll.json() == {"success": True, "cell": {"amount": "12.30"}}
    assert deleted_payroll.json() == {"success": True}
