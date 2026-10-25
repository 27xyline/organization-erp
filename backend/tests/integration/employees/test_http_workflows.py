"""Жизненный цикл HTTP с реальной PostgreSQL охватывает каждый перенесённый браузерный метод."""

import httpx
import pytest
from opentelemetry import trace

from app.api.dependencies import get_authenticated_context
from app.main import create_app


@pytest.mark.anyio
async def test_full_hr_http_method_matrix_on_postgresql(hr_env):
    env = hr_env
    app = create_app()
    app.state.tracer = trace.get_tracer(__name__)
    app.state.unit_of_work_factory = env["factory"]

    async def context():
        return env["context"]

    app.dependency_overrides[get_authenticated_context] = context
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/staff-schedule",
            json={
                "position": "HTTP",
                "departmentId": env["department_id"],
                "rate": 1,
                "salary": 100000,
            },
        )
        assert response.status_code == 201
        position_id = response.json()["data"]["id"]
        response = await client.post(
            "/api/employees",
            json={
                "code": env["prefix"],
                "fullName": "HTTP Worker",
                "staffScheduleId": position_id,
                "employmentRate": 1,
                "contractNumber": "42",
                "contractSignedDate": "2020-01-01",
                "contractEndDate": "2020-12-31",
            },
        )
        assert response.status_code == 201
        employee_id = response.json()["data"]["id"]
        response = await client.get("/api/employees?scope=expired&limit=1")
        assert response.json()["pagination"]["total"] == 1
        assert response.json()["data"][0]["id"] == employee_id
        response = await client.put("/api/employees/" + employee_id, json={"phone": None})
        assert response.status_code == 200 and response.json()["data"]["phone"] is None
        response = await client.put(
            "/api/employees/" + employee_id + "/profile",
            json={
                "skills": [{"name": "Python", "level": 5}],
                "certificates": [],
                "birthDate": None,
            },
        )
        assert response.status_code == 200
        response = await client.get("/api/employees/" + employee_id + "/profile")
        assert response.json()["data"]["employee"]["skills"][0]["name"] == "Python"
        assert response.json()["data"]["employee"]["staffSchedule"]["salary"] == 100000
        response = await client.get("/api/employees/dashboard?year=2026")
        assert set(response.json()["data"]) == {
            "employees",
            "staffSchedule",
            "departments",
            "vacations",
            "personnelActions",
        }
        response = await client.get("/api/employees/references")
        assert response.json()["data"][0]["id"] == employee_id
        response = await client.get("/api/staff-schedule")
        assert len(response.json()["data"]) == 2
        response = await client.put(
            "/api/staff-schedule/" + position_id,
            json={
                "position": "HTTP edited",
                "departmentId": env["department_id"],
                "rate": 1,
                "salary": 120000,
            },
        )
        assert response.status_code == 200 and response.json()["data"]["salary"] == "120000"
        response = await client.delete("/api/staff-schedule/" + position_id)
        assert response.status_code == 409 and response.json()["error"]["code"] == "POSITION_IN_USE"
        response = await client.post(
            "/api/personnel-actions",
            json={
                "type": "EDIT",
                "date": "2026-01-01",
                "employeeId": employee_id,
                "description": "HTTP edit",
            },
        )
        assert response.status_code == 201
        action_id = response.json()["data"]["id"]
        response = await client.get("/api/personnel-actions?limit=1")
        assert response.status_code == 200 and response.json()["pagination"]["total"] == 2
        response = await client.delete("/api/personnel-actions/" + action_id)
        assert response.json()["data"] == {"success": True}
        response = await client.post("/api/personnel-actions/sync")
        assert response.json()["data"] == {"success": True, "createdCount": 1}
        response = await client.post("/api/personnel-actions/sync")
        assert response.json()["data"]["createdCount"] == 0
        response = await client.post(
            "/api/vacations",
            json={"employeeId": employee_id, "startDate": "2026-12-31", "endDate": "2027-01-01"},
        )
        assert response.status_code == 201
        vacation_id = response.json()["data"]["id"]
        response = await client.get("/api/vacations?year=2026")
        assert len(response.json()["data"]) == 1
        response = await client.put(
            "/api/vacations/" + vacation_id,
            json={
                "employeeId": employee_id,
                "startDate": "2026-12-31",
                "endDate": "2027-01-01",
                "type": "SICK_LEAVE",
            },
        )
        assert response.status_code == 200 and response.json()["data"]["type"] == "SICK_LEAVE"
        response = await client.delete("/api/vacations/" + vacation_id)
        assert response.json()["data"] == {"success": True}
        response = await client.delete("/api/employees/" + employee_id)
        assert response.json()["data"] == {"success": True, "archived": True, "status": "DISMISSED"}
        response = await client.delete("/api/staff-schedule/" + position_id)
        assert response.json()["data"] == {"success": True}


@pytest.mark.anyio
@pytest.mark.parametrize("value", [None, 0])
async def test_real_http_null_numeric_signed_date_coercion_is_preserved(hr_env, value):
    from decimal import Decimal

    from app.services.dto.employees import EmployeeCommand

    env = hr_env
    employee = await env["employees"].create(
        EmployeeCommand(
            code=env["prefix"],
            fullName="Worker",
            contractNumber="42",
            contractSignedDate="2026-01-01",
            contractEndDate="2026-10-01",
            staffScheduleId=env["staff_id"],
            employmentRate=Decimal(1),
        ),
        env["context"],
    )
    app = create_app()
    app.state.tracer = trace.get_tracer(__name__)
    app.state.unit_of_work_factory = env["factory"]

    async def context():
        return env["context"]

    app.dependency_overrides[get_authenticated_context] = context
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.put(
            "/api/employees/" + employee.id, json={"contractSignedDate": value}
        )
        assert response.status_code == 200
        assert response.json()["data"]["contractSignedDate"] == "1970-01-01T00:00:00.000Z"
        response = await client.put(
            "/api/employees/" + employee.id, json={"phone": "unchanged date"}
        )
        assert response.json()["data"]["contractSignedDate"] == "1970-01-01T00:00:00.000Z"


@pytest.mark.anyio
async def test_http_profile_blank_certificate_fields_persist_sql_null(hr_env):
    from decimal import Decimal

    from sqlalchemy import select

    from app.models.employees import EmployeeCertificate
    from app.services.dto.employees import EmployeeCommand

    env = hr_env
    employee = await env["employees"].create(
        EmployeeCommand(
            code=env["prefix"],
            fullName="Worker",
            contractNumber="42",
            contractSignedDate="2026-01-01",
            staffScheduleId=env["staff_id"],
            employmentRate=Decimal(1),
        ),
        env["context"],
    )
    app = create_app()
    app.state.tracer = trace.get_tracer(__name__)
    app.state.unit_of_work_factory = env["factory"]

    async def context():
        return env["context"]

    app.dependency_overrides[get_authenticated_context] = context
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.put(
            "/api/employees/" + employee.id + "/profile",
            json={
                "skills": [{"name": "Python"}],
                "certificates": [{"name": "Diploma", "issuer": "", "number": "   "}],
                "education": "   ",
                "qualification": "",
            },
        )
        assert response.status_code == 200
        response = await client.get("/api/employees/" + employee.id + "/profile")
        record = response.json()["data"]["employee"]
        assert record["education"] is None and record["qualification"] is None
        assert (
            record["certificates"][0]["issuer"] is None
            and record["certificates"][0]["number"] is None
        )
        assert record["skills"][0]["level"] is None
    async with env["sessions"]() as session:
        certificate = await session.scalar(
            select(EmployeeCertificate).where(EmployeeCertificate.employeeId == employee.id)
        )
        assert certificate.issuer is None and certificate.number is None


@pytest.mark.anyio
@pytest.mark.parametrize("method", ["post", "put"])
async def test_vacation_missing_employee_keeps_unmapped_fk_error_as_generic_500(hr_env, method):
    env = hr_env
    app = create_app()
    app.state.tracer = trace.get_tracer(__name__)
    app.state.unit_of_work_factory = env["factory"]

    async def context():
        return env["context"]

    app.dependency_overrides[get_authenticated_context] = context
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
    ) as client:
        path = "/api/vacations"
        if method == "put":
            from decimal import Decimal

            from app.services.dto.employees import EmployeeCommand, VacationCommand

            employee = await env["employees"].create(
                EmployeeCommand(
                    code=env["prefix"],
                    fullName="Worker",
                    contractNumber="42",
                    contractSignedDate="2026-01-01",
                    staffScheduleId=env["staff_id"],
                    employmentRate=Decimal(1),
                ),
                env["context"],
            )
            vacation = await env["workforce"].save_vacation(
                None, VacationCommand(employee.id, "2026-01-01", "2026-01-01"), env["context"]
            )
            path += "/" + vacation.id
        response = await client.request(
            method,
            path,
            json={"employeeId": "missing", "startDate": "2026-01-01", "endDate": "2026-01-01"},
        )
        assert response.status_code == 500
        assert response.json()["error"]["code"] == "internal_error"
