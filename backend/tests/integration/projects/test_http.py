"""Every migrated route/method runs against the real schema and services."""

from dataclasses import replace
from decimal import Decimal

import httpx
import pytest
from opentelemetry import trace
from sqlalchemy import delete, func, select

from app.api.dependencies import get_authenticated_context
from app.domain.auth.rules import ScopeGrant
from app.main import create_app
from app.models.departments import Department
from app.models.employees import Employee
from app.models.notifications import NotificationOutbox
from app.models.users import AuditLog


@pytest.mark.anyio
async def test_project_task_member_http_matrix_and_legacy_shapes(project_env):
    _, _, project, context, sessions = project_env
    prefix = context.actor.actor_id
    app = create_app()
    app.state.tracer = trace.get_tracer(__name__)
    from app.db.uow import create_unit_of_work_factory

    app.state.unit_of_work_factory = create_unit_of_work_factory(sessions)

    async def auth():
        return context

    app.dependency_overrides[get_authenticated_context] = auth
    async with sessions() as session:
        session.add(Department(id=prefix, code=prefix, name=prefix))
        await session.flush()
        session.add(
            Employee(
                id=prefix,
                code=prefix,
                fullName="Worker",
                department="Engineering",
                departmentId=prefix,
                employmentRate="0.5",
            )
        )
        await session.commit()
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            listing = await client.get("/api/projects?limit=1")
            assert listing.status_code == 200
            assert listing.json()["pagination"] == {
                "page": 1,
                "pageSize": 1,
                "total": 1,
                "totalPages": 1,
            }
            assert listing.json()["data"][0]["plannedBudget"] == "12.34"
            assert (await client.get("/api/projects/references")).json()["data"] == [
                {"id": project.id, "code": project.code, "name": project.name}
            ]
            assert (await client.get("/api/projects/" + project.id)).json()["data"][
                "tasksList"
            ] == []
            assert (
                await client.put(
                    "/api/projects/" + project.id,
                    json={"code": prefix, "name": "Changed", "status": "ARCHIVED"},
                )
            ).json()["data"]["status"] == "ARCHIVED"
            created = await client.post(
                "/api/projects",
                json={
                    "code": prefix + "-http",
                    "name": "HTTP",
                    "templateId": "RESEARCH",
                    "startDate": "2026-01-01",
                },
            )
            assert created.status_code == 201
            second_id = created.json()["data"]["id"]
            assert len((await client.get(f"/api/projects/{second_id}/tasks")).json()["data"]) == 4
            members = await client.get(f"/api/projects/{project.id}/members")
            assert set(members.json()) == {"members", "availableEmployees"}
            assert members.json()["availableEmployees"][0]["rate"] == "0.50"
            added = await client.post(
                f"/api/projects/{project.id}/members", json={"employeeId": prefix}
            )
            assert added.status_code == 200, added.text
            member_id = added.json()["member"]["id"]
            task = await client.post(
                f"/api/projects/{project.id}/tasks",
                json={"name": "Task", "employeeIds": [prefix], "checklist": [{"title": "one"}]},
            )
            assert task.status_code == 201, task.text
            task_id = task.json()["data"]["id"]
            assert task.json()["data"]["assignees"] == [
                {"employeeId": prefix, "fullName": "Worker", "projectMemberId": member_id}
            ]
            assert (await client.put(f"/api/tasks/{task_id}", json={"status": "COMPLETED"})).json()[
                "data"
            ]["status"] == "COMPLETED"
            comment = await client.post(
                f"/api/tasks/{task_id}/comments", json={"body": " comment "}
            )
            assert comment.status_code == 201 and comment.json()["data"]["body"] == "comment"
            workspace = (await client.get(f"/api/projects/{project.id}/workspace")).json()["data"]
            assert workspace["tasksList"][0]["assignees"][0]["employee"]["fullName"] == "Worker"
            assert workspace["tasksList"][0]["comments"][0]["body"] == "comment"
            assert workspace["_count"] == {"assets": 0, "tasksList": 1, "financePlanEntries": 0}
            assert "TASK_COMMENT" in [
                item["action"]
                for item in (await client.get(f"/api/projects/{project.id}/activity")).json()[
                    "data"
                ]
            ]
            invalid = await client.put(f"/api/tasks/{task_id}", json={"name": None})
            assert (
                invalid.status_code == 422 and invalid.json()["error"]["code"] == "VALIDATION_ERROR"
            )
            invalid = await client.post(
                f"/api/projects/{project.id}/members", json={"employeeId": ""}
            )
            assert invalid.status_code == 400 and isinstance(invalid.json()["error"], str)
            child = await client.post(
                f"/api/projects/{project.id}/tasks",
                json=dict(name="Child", level=2, parentId=task_id, employeeIds=[prefix]),
            )
            assert child.status_code == 201
            child_id = child.json()["data"]["id"]
            list_value = (await client.get(f"/api/projects/{project.id}/tasks")).json()["data"]
            parent_value = next(item for item in list_value if item["id"] == task_id)
            assert parent_value["children"][0]["assignees"][0]["employee"]["fullName"] == "Worker"
            api_value = (await client.get(f"/api/projects/{project.id}")).json()["data"]
            assert (
                "assignees"
                not in next(item for item in api_value["tasksList"] if item["id"] == task_id)[
                    "children"
                ][0]
            )
            assert (await client.delete(f"/api/tasks/{child_id}")).status_code == 200
            assert (
                await client.patch(
                    f"/api/projects/{project.id}/members/{member_id}", json={"isArchived": True}
                )
            ).json()["member"]["isArchived"] is True
            invalid = await client.put(f"/api/tasks/{task_id}", json={"employeeIds": [prefix]})
            assert (
                invalid.status_code == 422
                and invalid.json()["error"]["code"] == "INVALID_ASSIGNEES"
            )
            assert (await client.delete(f"/api/tasks/{task_id}")).json() == {
                "data": {"success": True}
            }
            assert (await client.delete(f"/api/projects/{second_id}")).json() == {
                "data": {"success": True}
            }
        async with sessions() as session:
            assert (
                await session.scalar(
                    select(func.count())
                    .select_from(AuditLog)
                    .where(AuditLog.action.like("PROJECT_MEMBER%"))
                )
                == 0
            )
            assert await session.scalar(select(func.count()).select_from(NotificationOutbox)) == 0
    finally:
        async with sessions() as session:
            await session.execute(delete(Employee).where(Employee.id == prefix))
            await session.execute(delete(Department).where(Department.id == prefix))
            await session.commit()


@pytest.mark.anyio
async def test_project_manager_member_mutation_redacts_salary_but_keeps_snapshot(project_env):
    from app.db.uow import create_unit_of_work_factory
    from app.models.projects import ProjectMember
    from app.models.timekeeping import StaffSchedule

    _, _, project, admin_context, sessions = project_env
    prefix = admin_context.actor.actor_id
    access = replace(
        admin_context.actor.access,
        grants=(
            ScopeGrant("pm", "PROJECT_MANAGER", "NONE", "ASSIGNED", project_ids=(project.id,)),
        ),
    )
    current_context = replace(admin_context, actor=replace(admin_context.actor, access=access))
    app = create_app()
    app.state.tracer = trace.get_tracer(__name__)
    app.state.unit_of_work_factory = create_unit_of_work_factory(sessions)

    async def auth():
        return current_context

    app.dependency_overrides[get_authenticated_context] = auth
    async with sessions() as session:
        session.add(Department(id=prefix, code=prefix, name=prefix))
        await session.flush()
        session.add(
            StaffSchedule(
                id=prefix,
                position="Engineer",
                department="Engineering",
                departmentId=prefix,
                rate=1,
                salary=100000,
            )
        )
        await session.flush()
        session.add(
            Employee(
                id=prefix,
                code=prefix,
                fullName="Worker",
                department="Engineering",
                departmentId=prefix,
                employmentRate="0.5",
                staffScheduleId=prefix,
            )
        )
        await session.commit()
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                f"/api/projects/{project.id}/members", json={"employeeId": prefix}
            )
            assert response.status_code == 200
            member = response.json()["member"]
            assert member["salary"] == "" and member["employee"]["staffSchedule"]["salary"] == ""
            member_id = member["id"]
            response = await client.patch(
                f"/api/projects/{project.id}/members/{member_id}", json={"isArchived": True}
            )
            assert response.json()["member"]["salary"] == ""
            assert response.json()["member"]["employee"]["staffSchedule"]["salary"] == ""
            current_context = admin_context
            response = await client.patch(
                f"/api/projects/{project.id}/members/{member_id}", json={"isArchived": False}
            )
            assert response.json()["member"]["salary"] == "50000.00"
            assert response.json()["member"]["employee"]["staffSchedule"]["salary"] == "100000.00"
        async with sessions() as session:
            assert (await session.get(ProjectMember, member_id)).salary == 50000
    finally:
        async with sessions() as session:
            await session.execute(delete(Employee).where(Employee.id == prefix))
            await session.execute(delete(StaffSchedule).where(StaffSchedule.id == prefix))
            await session.execute(delete(Department).where(Department.id == prefix))
            await session.commit()


@pytest.mark.anyio
async def test_project_code_conflict_preserves_post409_but_legacy_put500(project_env):
    from app.db.uow import create_unit_of_work_factory

    _, _, project, context, sessions = project_env
    app = create_app()
    app.state.tracer = trace.get_tracer(__name__)
    app.state.unit_of_work_factory = create_unit_of_work_factory(sessions)

    async def auth():
        return context

    app.dependency_overrides[get_authenticated_context] = auth
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        duplicate_create = await client.post(
            "/api/projects", json=dict(code=project.code, name="Duplicate")
        )
        assert duplicate_create.status_code == 409
        assert duplicate_create.json()["error"]["code"] == "PROJECT_CODE_EXISTS"
        other = (
            await client.post(
                "/api/projects", json=dict(code=project.code + "-other", name="Other")
            )
        ).json()["data"]
        duplicate_update = await client.put(
            "/api/projects/" + other["id"], json=dict(code=project.code, name="Duplicate")
        )
        assert duplicate_update.status_code == 500
        assert duplicate_update.json()["error"]["code"] == "internal_error"
        assert (
            "constraint" not in duplicate_update.text
            and "projects_code_key" not in duplicate_update.text
        )
        assert (await client.get("/api/projects/" + other["id"])).json()["data"]["name"] == "Other"


@pytest.mark.anyio
async def test_malformed_dates_preserve_legacy500_and_rollback_state(project_env):
    from app.db.uow import create_unit_of_work_factory
    from app.models.projects import Project, Task

    _, _, project, context, sessions = project_env
    app = create_app()
    app.state.tracer = trace.get_tracer(__name__)
    app.state.unit_of_work_factory = create_unit_of_work_factory(sessions)

    async def auth():
        return context

    app.dependency_overrides[get_authenticated_context] = auth
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        valid = await client.post(f"/api/projects/{project.id}/tasks", json=dict(name="Before"))
        task_id = valid.json()["data"]["id"]
        async with sessions() as session:
            before = await session.scalar(
                select(func.count())
                .select_from(AuditLog)
                .where(AuditLog.userId == context.actor.actor_id)
            )
            project_count_before = await session.scalar(select(func.count()).select_from(Project))
        requests = [
            (
                "POST",
                "/api/projects",
                dict(
                    code=project.code + "-bad",
                    name="Malformed",
                    startDate="not-a-real-date",
                    status="ACTIVE",
                ),
            ),
            (
                "PUT",
                "/api/projects/" + project.id,
                dict(
                    code=project.code,
                    name="Malformed",
                    startDate="not-a-real-date",
                    status="ACTIVE",
                ),
            ),
            (
                "POST",
                f"/api/projects/{project.id}/tasks",
                dict(name="Malformed", startDate="not-a-real-date"),
            ),
            ("PUT", "/api/tasks/" + task_id, dict(name="Malformed", startDate="not-a-real-date")),
        ]
        for method, path, body in requests:
            response = await client.request(method, path, json=body)
            assert response.status_code == 500, (method, path, response.text)
            assert response.json()["error"]["code"] == "internal_error"
            assert "not-a-real-date" not in response.text and "Prisma" not in response.text
        async with sessions() as session:
            assert (
                await session.scalar(select(func.count()).select_from(Project))
                == project_count_before
            )
            assert (
                await session.scalar(
                    select(Project.id).where(Project.code == project.code + "-bad")
                )
                is None
            )
            unchanged = await session.get(Project, project.id)
            assert unchanged is not None
            assert unchanged.code == project.code
            assert unchanged.name == project.name
            assert unchanged.startDate == project.startDate
            assert unchanged.endDate == project.endDate
            assert unchanged.status == project.status
            assert unchanged.plannedBudget == Decimal(project.plannedBudget)
            assert unchanged.actualBudget == Decimal(project.actualBudget)
            assert (await session.get(Task, task_id)).name == "Before"
            assert (await session.get(Task, task_id)).startDate is None
            assert (
                await session.scalar(
                    select(func.count())
                    .select_from(AuditLog)
                    .where(AuditLog.userId == context.actor.actor_id)
                )
                == before
            )
