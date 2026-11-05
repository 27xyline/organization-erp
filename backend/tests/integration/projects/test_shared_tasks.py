"""Общие задачи используют ту же модель, что и задачи проектов."""

import httpx
import pytest
from opentelemetry import trace

from app.api.dependencies import get_authenticated_context
from app.db.uow import create_unit_of_work_factory
from app.main import create_app


@pytest.mark.anyio
async def test_admin_creates_and_lists_general_task(project_env):
    _, _, _, context, sessions = project_env
    app = create_app()
    app.state.tracer = trace.get_tracer(__name__)
    app.state.unit_of_work_factory = create_unit_of_work_factory(sessions)
    app.dependency_overrides[get_authenticated_context] = lambda: context
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        created = await client.post("/api/tasks", json={"name": "General"})
        assert created.status_code == 201, created.text
        assert created.json()["data"]["projectId"] is None
        listing = await client.get("/api/tasks")
        assert listing.status_code == 200
        assert created.json()["data"]["id"] in [t["id"] for t in listing.json()["data"]]
        assert (
            await client.delete("/api/tasks/" + created.json()["data"]["id"])
        ).status_code == 200


@pytest.mark.anyio
async def test_assigned_employee_sees_and_changes_only_own_tasks(project_env):
    from dataclasses import replace

    from sqlalchemy import delete

    from app.core.context import Actor
    from app.domain.auth.rules import AccessContext, ScopeGrant
    from app.models.departments import Department
    from app.models.employees import Employee

    _, _, project, context, sessions = project_env
    prefix = context.actor.actor_id
    first, second = prefix + "-one", prefix + "-two"
    async with sessions() as session:
        session.add(Department(id=prefix, code=prefix, name=prefix))
        await session.flush()
        session.add_all(
            [
                Employee(id=first, code=first, fullName="One", department="D", departmentId=prefix),
                Employee(
                    id=second, code=second, fullName="Two", department="D", departmentId=prefix
                ),
            ]
        )
        await session.commit()
    app = create_app()
    app.state.tracer = trace.get_tracer(__name__)
    app.state.unit_of_work_factory = create_unit_of_work_factory(sessions)
    current = context
    app.dependency_overrides[get_authenticated_context] = lambda: current
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            assert (
                await client.post(f"/api/projects/{project.id}/members", json={"employeeId": first})
            ).status_code == 200
            project_task = await client.post(
                f"/api/projects/{project.id}/tasks",
                json={"name": "Project", "employeeIds": [first]},
            )
            assert project_task.status_code == 201, project_task.text
            options = await client.get("/api/tasks/assignees")
            assert options.status_code == 200
            assert {first, second} <= {entry["id"] for entry in options.json()["data"]}
            assert all(set(entry) == {"id", "fullName"} for entry in options.json()["data"])
            one = await client.post("/api/tasks", json={"name": "One", "employeeIds": [first]})
            two = await client.post("/api/tasks", json={"name": "Two", "employeeIds": [second]})
            assert one.status_code == two.status_code == 201
            ids = {
                one.json()["data"]["id"],
                two.json()["data"]["id"],
                project_task.json()["data"]["id"],
            }
            assert ids <= {task["id"] for task in (await client.get("/api/tasks")).json()["data"]}
            manager_access = AccessContext(
                prefix, None, None, (), (ScopeGrant(prefix, "PROJECT_MANAGER", "NONE", "ASSIGNED"),)
            )
            current = replace(
                context,
                actor=Actor(
                    prefix, is_authenticated=True, session_version=1, access=manager_access
                ),
            )
            assert ids <= {task["id"] for task in (await client.get("/api/tasks")).json()["data"]}
            assert (await client.get(f"/api/projects/{project.id}/tasks")).status_code == 403
            assert (
                await client.put(
                    f"/api/tasks/{project_task.json()['data']['id']}", json={"name": "Denied"}
                )
            ).status_code == 403
            access = AccessContext(
                prefix, first, prefix, (), (ScopeGrant(prefix, "EMPLOYEE", "SELF", "SELF"),)
            )
            actor = Actor(
                prefix, is_authenticated=True, employee_id=first, session_version=1, access=access
            )
            current = replace(context, actor=actor)
            assert (await client.get("/api/tasks/assignees")).status_code == 403
            listing = await client.get("/api/tasks")
            assert {task["id"] for task in listing.json()["data"]} == {
                one.json()["data"]["id"],
                project_task.json()["data"]["id"],
            }
            project_summary = next(
                t for t in listing.json()["data"] if t["id"] == project_task.json()["data"]["id"]
            )
            assert project_summary["canReadProject"] is False
            assert "comments" not in project_summary
            assert (await client.get(f"/api/projects/{project.id}")).status_code == 403
            assert (
                await client.patch(
                    f"/api/tasks/{one.json()['data']['id']}/status", json={"status": "COMPLETED"}
                )
            ).status_code == 200
            assert (
                await client.patch(
                    f"/api/tasks/{project_task.json()['data']['id']}/status",
                    json={"status": "IN_PROGRESS"},
                )
            ).status_code == 200
            assert (
                await client.patch(
                    f"/api/tasks/{two.json()['data']['id']}/status", json={"status": "COMPLETED"}
                )
            ).status_code == 403
            assert (
                await client.put(f"/api/tasks/{one.json()['data']['id']}", json={"name": "Denied"})
            ).status_code == 403
            extra = await client.patch(
                f"/api/tasks/{one.json()['data']['id']}/status",
                json={"status": "COMPLETED", "name": "Denied"},
            )
            assert extra.status_code == 422
            current = context
            assert (
                await client.delete(f"/api/tasks/{one.json()['data']['id']}")
            ).status_code == 200
            assert (
                await client.delete(f"/api/tasks/{two.json()['data']['id']}")
            ).status_code == 200
    finally:
        async with sessions() as session:
            # Project membership is deleted with the project in project_env cleanup.
            from app.models.projects import ProjectMember, Task

            await session.execute(delete(Task).where(Task.projectId == project.id))
            await session.execute(
                delete(ProjectMember).where(ProjectMember.projectId == project.id)
            )
            await session.execute(delete(Employee).where(Employee.id.in_([first, second])))
            await session.execute(delete(Department).where(Department.id == prefix))
            await session.commit()
