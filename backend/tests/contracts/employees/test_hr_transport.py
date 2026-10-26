"""Матрица транспортных проверок через реальные маршруты FastAPI независимо от доступности
PostgreSQL.
"""

from dataclasses import replace
from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace

import httpx
import pytest

from app.api.dependencies import (
    get_authenticated_context,
    get_employee_service,
)
from app.core.context import Actor, RequestContext
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.domain.errors import DomainError
from app.domain.ports.employees import EmployeeItem, StaffItem
from app.main import create_app
from app.schemas.employees import (
    EmployeeUpdateInput,
    PersonnelInput,
)


@pytest.fixture
def employee_record():
    date = datetime(2026, 1, 1)
    position = StaffItem(
        "p", "Engineer", "Department", "d", Decimal("1.00"), Decimal("100000.00"), date, date
    )
    return EmployeeItem(
        "e",
        "001",
        "Worker",
        "Department",
        "d",
        None,
        "PRIMARY",
        date,
        None,
        "42",
        None,
        None,
        None,
        None,
        None,
        None,
        "p",
        Decimal("0.50"),
        "ACTIVE",
        date,
        date,
        position,
    )


@pytest.fixture
def contract_app(employee_record):
    app = create_app()
    from opentelemetry import trace

    app.state.tracer = trace.get_tracer(__name__)
    access = AccessContext("u", "e", "d", (), (ScopeGrant("a", "ADMIN", "ALL", "ALL"),))
    context = RequestContext(
        "request", actor=Actor(actor_id="u", is_authenticated=True, access=access)
    )
    calls = []

    async def get_context():
        return context

    async def listing(query, actor):
        calls.append(("list", query))
        return [employee_record], 3

    async def create(command, context):
        calls.append(("create", command))
        return employee_record

    async def update(identifier, command, context):
        calls.append(("update", command))
        return employee_record

    async def dismiss(identifier, context):
        return replace(employee_record, status="DISMISSED")

    async def references(actor):
        return [employee_record]

    service = SimpleNamespace(
        list=listing, create=create, update=update, dismiss=dismiss, references=references
    )
    app.dependency_overrides[get_authenticated_context] = get_context
    app.dependency_overrides[get_employee_service] = lambda: service
    return app, calls


@pytest.mark.anyio
async def test_employee_http_preserves_decimal_null_relation_and_pagination(contract_app):
    app, calls = contract_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/api/employees?scope=active&limit=1&page=2")
        assert response.status_code == 200
        data = response.json()
        assert data["pagination"] == {
            "scope": "active",
            "page": 2,
            "pageSize": 1,
            "total": 3,
            "totalPages": 3,
        }
        employee = data["data"][0]
        assert employee["employmentRate"] == "0.5"
        assert employee["contractEndDate"] is None
        assert employee["contractSignedDate"] == "2026-01-01T00:00:00.000Z"
        assert employee["staffSchedule"]["salary"] == "100000"
        assert employee["staffSchedule"]["departmentRef"] == {"isActive": True}
        assert calls[0][1].page_size == 1
        response = await client.delete("/api/employees/e")
        assert response.json() == {
            "data": {"success": True, "archived": True, "status": "DISMISSED"}
        }


@pytest.mark.anyio
async def test_create_and_put_keep_staff_relation_without_department_ref(contract_app):
    app, calls = contract_app
    payload = {
        "code": "001",
        "fullName": "Worker",
        "contractSignedDate": "2026-01-01",
        "contractNumber": "42",
        "staffScheduleId": "p",
        "employmentRate": "0.5",
    }
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/api/employees", json=payload)
        assert response.status_code == 201
        assert "departmentRef" not in response.json()["data"]["staffSchedule"]
        response = await client.put("/api/employees/e", json={"contractEndDate": None})
        assert response.status_code == 200
        assert calls[-1][1].fields == frozenset({"contractEndDate"})


def test_contract_update_omission_is_distinct_from_explicit_null():
    assert EmployeeUpdateInput().command().fields == frozenset()
    assert EmployeeUpdateInput(staffScheduleId=None).command().fields == frozenset(
        {"staffScheduleId"}
    )


def test_personnel_hire_keeps_loose_nested_payload_for_domain_validation():
    draft = PersonnelInput(type="HIRE", date="2026-01-01", employeeData={"code": "1"}).command()
    assert draft.employeeData is not None
    assert draft.employeeData.fullName is None


def test_hr_openapi_complete_method_matrix():
    paths = create_app().openapi()["paths"]
    expected = {
        "/api/employees": {"get", "post"},
        "/api/employees/{identifier}": {"put", "delete"},
        "/api/employees/{identifier}/profile": {"get", "put"},
        "/api/employees/references": {"get"},
        "/api/employees/dashboard": {"get"},
        "/api/personnel-actions": {"get", "post"},
        "/api/personnel-actions/{identifier}": {"delete"},
        "/api/personnel-actions/sync": {"post"},
        "/api/vacations": {"get", "post"},
        "/api/vacations/{identifier}": {"put", "delete"},
        "/api/staff-schedule": {"get", "post"},
        "/api/staff-schedule/{identifier}": {"put", "delete"},
    }
    for path, methods in expected.items():
        assert set(paths[path]) == methods


@pytest.mark.parametrize(
    "payload",
    [
        {"code": None},
        {"fullName": None},
        {"contractNumber": None},
        {"contractType": None},
        {"status": None},
    ],
)
def test_partial_employee_rejects_null_for_nonnullable_fields(payload):
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        EmployeeUpdateInput(**payload)


def test_profile_calendar_dates_are_validated_and_nullable_dates_are_supported():
    from pydantic import ValidationError

    from app.schemas.employees import ProfileInput

    with pytest.raises(ValidationError):
        ProfileInput(skills=[], certificates=[], birthDate="2026-02-30")
    assert ProfileInput(skills=[], certificates=[], birthDate=None).birthDate is None


@pytest.mark.anyio
async def test_missing_personnel_action_delete_keeps_legacy_generic_500(contract_app):
    from app.api.dependencies import get_personnel_action_service

    app, _ = contract_app

    async def missing(identifier, context):
        raise DomainError("INVALID_ACTION_DATE", "Некорректная дата кадрового действия", 400)

    app.dependency_overrides[get_personnel_action_service] = lambda: SimpleNamespace(delete=missing)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
    ) as client:
        response = await client.delete("/api/personnel-actions/missing")
    assert response.status_code == 500
    assert response.json()["error"]["code"] != "INVALID_ACTION_DATE"


@pytest.mark.parametrize("value", [None, 0])
def test_update_signed_date_coerces_null_or_zero_to_epoch_without_changing_create(value):
    from pydantic import ValidationError

    from app.schemas.employees import EmployeeCreateInput

    command = EmployeeUpdateInput(contractSignedDate=value).command()
    assert command.contractSignedDate == "1970-01-01T00:00:00.000Z"
    with pytest.raises(ValidationError):
        EmployeeCreateInput(
            code="1",
            fullName="Worker",
            contractNumber="42",
            staffScheduleId="p",
            employmentRate=1,
            contractSignedDate=value,
        )


@pytest.mark.anyio
@pytest.mark.parametrize("value", [None, 0])
async def test_http_update_passes_legacy_epoch_coercion_to_service(contract_app, value):
    app, calls = contract_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.put("/api/employees/e", json={"contractSignedDate": value})
    assert response.status_code == 200
    assert calls[-1][1].contractSignedDate == "1970-01-01T00:00:00.000Z"
