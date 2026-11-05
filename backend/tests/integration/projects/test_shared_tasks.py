"""Общие задачи используют ту же модель, что и задачи проектов."""

import httpx
import pytest
from opentelemetry import trace

from app.api.dependencies import get_authenticated_context
from app.db.uow import create_unit_of_work_factory
from app.main import create_app


@pytest.mark.anyio
async def test_admin_creates_and_lists_general_task(project_env):
    from sqlalchemy import event

    _, _, _, context, sessions = project_env
    app = create_app()
    app.state.tracer = trace.get_tracer(__name__)
    app.state.unit_of_work_factory = create_unit_of_work_factory(sessions)
    app.dependency_overrides[get_authenticated_context] = lambda: context
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        selects = []

        def capture(conn, cursor, statement, parameters, context, executemany):
            if statement.lstrip().upper().startswith("SELECT"):
                selects.append(statement.lower())

        event.listen(sessions.kw["bind"].sync_engine, "before_cursor_execute", capture)
        try:
            created = await client.post("/api/tasks", json={"name": "General"})
        finally:
            event.remove(sessions.kw["bind"].sync_engine, "before_cursor_execute", capture)
        assert len(selects) <= 12
        task_queries = [sql for sql in selects if "from tasks" in sql]
        assert task_queries and all("tasks.id =" in sql for sql in task_queries)
        assert created.status_code == 201, created.text
        assert created.json()["data"]["projectId"] is None
        assert created.json()["data"]["assignees"] == []
        assert created.json()["data"]["checklist"] == []
        updated = await client.put(
            "/api/tasks/" + created.json()["data"]["id"],
            json={"checklist": [{"title": "Check"}]},
        )
        assert updated.status_code == 200
        assert updated.json()["data"]["checklist"][0]["title"] == "Check"
        assert updated.json()["data"]["assignees"] == []
        listing = await client.get("/api/tasks")
        assert listing.status_code == 200
        assert created.json()["data"]["id"] in [t["id"] for t in listing.json()["data"]]
        assert (
            await client.delete("/api/tasks/" + created.json()["data"]["id"])
        ).status_code == 200


@pytest.mark.anyio
async def test_assigned_employee_sees_and_changes_only_own_tasks(project_env):
    from dataclasses import replace

    from sqlalchemy import delete, event, update

    from app.core.context import Actor
    from app.domain.auth.rules import AccessContext, ScopeGrant
    from app.models.departments import Department
    from app.models.employees import Employee
    from app.models.users import User

    _, _, project, context, sessions = project_env
    prefix = context.actor.actor_id
    first, second = prefix + "-one", prefix + "-two"
    employee_user = prefix + "-employee-user"
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
        session.add(
            User(
                id=employee_user,
                username=employee_user,
                name="Employee",
                passwordHash="unused",
                mustChangePassword=False,
                role="VIEWER",
            )
        )
        await session.commit()
    app = create_app()
    app.state.tracer = trace.get_tracer(__name__)
    app.state.unit_of_work_factory = create_unit_of_work_factory(sessions)
    app.state.session_factory = sessions
    current = context
    task_ids: set[str] = set()
    app.dependency_overrides[get_authenticated_context] = lambda: current
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            assert (
                await client.post(f"/api/projects/{project.id}/members", json={"employeeId": first})
            ).status_code == 200
            assert (
                await client.post(
                    f"/api/projects/{project.id}/members", json={"employeeId": second}
                )
            ).status_code == 200
            hidden_task = await client.post(
                f"/api/projects/{project.id}/tasks",
                json={"name": "Hidden sentinel", "employeeIds": [second]},
            )
            assert hidden_task.status_code == 201, hidden_task.text
            hidden_id = hidden_task.json()["data"]["id"]
            task_ids.add(hidden_id)
            project_task = await client.post(
                f"/api/projects/{project.id}/tasks",
                json={"name": "Project", "description": "Private", "employeeIds": [first, second]},
            )
            assert project_task.status_code == 201, project_task.text
            options = await client.get("/api/tasks/assignees")
            assert options.status_code == 200
            assert {first, second} <= {entry["id"] for entry in options.json()["data"]}
            assert all(set(entry) == {"id", "fullName"} for entry in options.json()["data"])
            one = await client.post("/api/tasks", json={"name": "One", "employeeIds": [first]})
            two = await client.post("/api/tasks", json={"name": "Two", "employeeIds": [second]})
            assert one.status_code == two.status_code == 201
            assert one.json()["data"]["assignees"][0]["employeeId"] == first
            ids = {
                one.json()["data"]["id"],
                two.json()["data"]["id"],
                project_task.json()["data"]["id"],
            }
            task_ids.update(ids)
            async with sessions() as session:
                await session.execute(
                    update(Employee).where(Employee.id == second).values(status="DISMISSED")
                )
                await session.commit()
            update_selects = []

            def capture_update(conn, cursor, statement, parameters, context, executemany):
                if statement.lstrip().upper().startswith("SELECT"):
                    update_selects.append(statement.lower())

            event.listen(sessions.kw["bind"].sync_engine, "before_cursor_execute", capture_update)
            try:
                kept = await client.put(
                    f"/api/tasks/{two.json()['data']['id']}",
                    json={"name": "Updated", "employeeIds": [second]},
                )
            finally:
                event.remove(
                    sessions.kw["bind"].sync_engine, "before_cursor_execute", capture_update
                )
            assert kept.status_code == 200, kept.text
            assert kept.json()["data"]["assignees"][0]["employeeId"] == second
            assert len(update_selects) <= 15
            assert all("tasks.id =" in sql for sql in update_selects if "from tasks" in sql)
            forbidden_add = await client.put(
                f"/api/tasks/{one.json()['data']['id']}", json={"employeeIds": [first, second]}
            )
            assert forbidden_add.status_code == 422
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
            manager_statements = []

            def count_manager_sql(conn, cursor, statement, parameters, context, executemany):
                if statement.lstrip().upper().startswith("SELECT"):
                    manager_statements.append(statement)

            event.listen(
                sessions.kw["bind"].sync_engine, "before_cursor_execute", count_manager_sql
            )
            try:
                manager_listing = (await client.get("/api/tasks")).json()["data"]
            finally:
                event.remove(
                    sessions.kw["bind"].sync_engine, "before_cursor_execute", count_manager_sql
                )
            assert len(manager_statements) <= 2
            assert {one.json()["data"]["id"], two.json()["data"]["id"]} <= {
                task["id"] for task in manager_listing
            }
            assert project_task.json()["data"]["id"] not in {task["id"] for task in manager_listing}
            general = next(
                task for task in manager_listing if task["id"] == two.json()["data"]["id"]
            )
            assert general["assignees"] == [
                {"employeeId": second, "fullName": "Two", "active": False}
            ]
            assert (await client.get(f"/api/projects/{project.id}/tasks")).status_code == 403
            hidden_update = await client.put(
                f"/api/tasks/{project_task.json()['data']['id']}", json={"name": "Denied"}
            )
            missing_update = await client.put("/api/tasks/nonexistent", json={"name": "Denied"})
            assert hidden_update.status_code == missing_update.status_code == 404
            assert hidden_update.json() == missing_update.json()
            # Назначенный менеджер без доступа к проекту не должен блокировать строки.
            manager_access = AccessContext(
                prefix,
                first,
                prefix,
                (),
                (ScopeGrant(prefix, "PROJECT_MANAGER", "NONE", "ASSIGNED"),),
            )
            current = replace(
                context,
                actor=Actor(
                    prefix,
                    is_authenticated=True,
                    employee_id=first,
                    session_version=1,
                    access=manager_access,
                ),
            )
            denied_locks = []

            def capture_manager_locks(conn, cursor, statement, parameters, context, executemany):
                sql = statement.lower()
                if "for update" in sql and ("from tasks" in sql or "from projects" in sql):
                    denied_locks.append(statement)

            event.listen(
                sessions.kw["bind"].sync_engine, "before_cursor_execute", capture_manager_locks
            )
            try:
                denied_status = await client.patch(
                    f"/api/tasks/{project_task.json()['data']['id']}/status",
                    json={"status": "IN_PROGRESS"},
                )
            finally:
                event.remove(
                    sessions.kw["bind"].sync_engine, "before_cursor_execute", capture_manager_locks
                )
            assert denied_status.status_code == 403
            assert denied_locks == []

            manager_access = AccessContext(
                prefix,
                first,
                prefix,
                (),
                (
                    ScopeGrant(
                        prefix, "PROJECT_MANAGER", "NONE", "ASSIGNED", project_ids=(project.id,)
                    ),
                ),
            )
            current = replace(context, actor=replace(current.actor, access=manager_access))
            assert (
                await client.patch(
                    f"/api/tasks/{project_task.json()['data']['id']}/status",
                    json={"status": "IN_PROGRESS"},
                )
            ).status_code == 200
            access = AccessContext(
                employee_user,
                first,
                prefix,
                (),
                (ScopeGrant(employee_user, "EMPLOYEE", "SELF", "SELF"),),
            )
            actor = Actor(
                employee_user,
                is_authenticated=True,
                employee_id=first,
                session_version=1,
                access=access,
            )
            current = replace(context, actor=actor)
            assert (await client.get("/api/tasks/assignees")).status_code == 403
            statements = []

            def count_sql(conn, cursor, statement, parameters, context, executemany):
                if statement.lstrip().upper().startswith("SELECT"):
                    statements.append(statement)

            event.listen(sessions.kw["bind"].sync_engine, "before_cursor_execute", count_sql)
            try:
                listing = await client.get("/api/tasks")
            finally:
                event.remove(sessions.kw["bind"].sync_engine, "before_cursor_execute", count_sql)
            assert len(statements) <= 2
            assert {task["id"] for task in listing.json()["data"]} == {
                one.json()["data"]["id"],
                two.json()["data"]["id"],
                project_task.json()["data"]["id"],
            }
            project_summary = next(
                t for t in listing.json()["data"] if t["id"] == project_task.json()["data"]["id"]
            )
            assert project_summary["canReadProject"] is False
            assert set(project_summary) <= {
                "id",
                "name",
                "status",
                "isGeneral",
                "projectName",
                "isAssignedToMe",
                "canReadProject",
            }
            assert project_summary["isAssignedToMe"] is True
            assert project_summary["isGeneral"] is False
            assert (await client.get(f"/api/projects/{project.id}")).status_code == 403
            assert (
                await client.patch(
                    f"/api/tasks/{one.json()['data']['id']}/status", json={"status": "COMPLETED"}
                )
            ).status_code == 200
            status_selects = []

            def capture_status(conn, cursor, statement, parameters, context, executemany):
                if statement.lstrip().upper().startswith("SELECT"):
                    status_selects.append(statement.lower())

            event.listen(sessions.kw["bind"].sync_engine, "before_cursor_execute", capture_status)
            try:
                changed = await client.patch(
                    f"/api/tasks/{project_task.json()['data']['id']}/status",
                    json={"status": "IN_PROGRESS"},
                )
            finally:
                event.remove(
                    sessions.kw["bind"].sync_engine, "before_cursor_execute", capture_status
                )
            assert changed.status_code == 200
            assignment_checks = [
                i for i, sql in enumerate(status_selects) if "task_assignees" in sql
            ]
            task_lock = next(
                i
                for i, sql in enumerate(status_selects)
                if "from tasks" in sql and "for update" in sql
            )
            assert (
                len(assignment_checks) == 2
                and assignment_checks[0] < task_lock < assignment_checks[1]
            )
            assert len(status_selects) <= 10
            assert not any(
                name in sql
                for sql in status_selects
                for name in ("task_comments", "task_dependencies", "task_checklist_items")
            )
            denied_trace = []

            def capture_denied(conn, cursor, statement, parameters, context, executemany):
                denied_trace.append(statement.lower())

            event.listen(sessions.kw["bind"].sync_engine, "before_cursor_execute", capture_denied)
            try:
                unassigned = await client.patch(
                    f"/api/tasks/{two.json()['data']['id']}/status", json={"status": "COMPLETED"}
                )
                missing = await client.patch(
                    "/api/tasks/nonexistent/status", json={"status": "COMPLETED"}
                )
            finally:
                event.remove(
                    sessions.kw["bind"].sync_engine, "before_cursor_execute", capture_denied
                )
            assert not any(
                ("from tasks" in sql or "from projects" in sql) and "for update" in sql
                for sql in denied_trace
            )
            assert unassigned.status_code == missing.status_code == 404
            assert unassigned.json() == missing.json()
            auditor_access = AccessContext(
                prefix, first, prefix, (), (ScopeGrant(prefix, "AUDITOR", "ALL", "ALL"),)
            )
            current = replace(context, actor=replace(actor, access=auditor_access))
            assert (
                await client.patch(
                    f"/api/tasks/{one.json()['data']['id']}/status", json={"status": "COMPLETED"}
                )
            ).status_code == 403
            current = replace(context, actor=actor)
            assert (
                await client.put(f"/api/tasks/{one.json()['data']['id']}", json={"name": "Denied"})
            ).status_code == 403
            own = await client.post("/api/tasks", json={"name": "Own", "employeeIds": [first]})
            assert own.status_code == 201, own.text
            own_id = own.json()["data"]["id"]
            task_ids.add(own_id)
            assert (
                await client.put(f"/api/tasks/{own_id}", json={"name": "Edited"})
            ).status_code == 200
            assert (
                await client.put(f"/api/tasks/{own_id}", json={"employeeIds": [second]})
            ).status_code == 422
            assert (await client.delete(f"/api/tasks/{own_id}")).status_code == 403
            assert (
                await client.post("/api/tasks", json={"name": "Wrong", "employeeIds": [second]})
            ).status_code == 422
            extra = await client.patch(
                f"/api/tasks/{one.json()['data']['id']}/status",
                json={"status": "COMPLETED", "name": "Denied"},
            )
            assert extra.status_code == 422
            # Membership grants a project page, but never other people's task metadata.
            member_access = replace(access, member_project_ids=(project.id,))
            current = replace(context, actor=replace(actor, access=member_access))
            workspace_response = await client.get(f"/api/projects/{project.id}/workspace")
            assert workspace_response.status_code == 200
            workspace = workspace_response.json()["data"]
            assert [item["id"] for item in workspace["tasksList"]] == [
                project_task.json()["data"]["id"]
            ]
            assert workspace["tasksList"][0]["assignees"][0]["employee"]["fullName"]
            assert "creatorId" not in workspace["tasksList"][0]
            assert workspace["_count"]["tasksList"] == 1
            assert hidden_id not in str(
                (await client.get(f"/api/projects/{project.id}/activity")).json()
            )
            assert hidden_id not in str(
                (await client.get(f"/api/projects/{project.id}/tasks")).json()
            )
            search = await client.get("/api/search", params={"q": "Hidden sentinel"})
            dashboard = await client.get("/api/dashboard")
            assert search.status_code == dashboard.status_code == 200
            assert hidden_id not in str(search.json()) and "Hidden sentinel" not in str(
                search.json()
            )
            assert hidden_id not in str(dashboard.json()) and "Hidden sentinel" not in str(
                dashboard.json()
            )
            async with sessions() as session:
                from datetime import datetime

                from app.repositories.projects import SqlAlchemyProjectRepository
                from app.repositories.reporting import SqlAlchemyReportingRepository
                from app.repositories.timekeeping import SqlAlchemyTimekeepingRepository

                repo = SqlAlchemyProjectRepository(lambda: session)
                page = await repo.list(1, 100, None, (project.id,), access=member_access)
                assert page.projects[0].counts["tasksList"] == 1
                options = await SqlAlchemyTimekeepingRepository(lambda: session).project_options(
                    member_access
                )
                option = next(item for item in options if item["id"] == project.id)
                assert [item["id"] for item in option["tasksList"]] == [
                    project_task.json()["data"]["id"]
                ]
                report = await SqlAlchemyReportingRepository(session).dashboard(
                    {
                        "dateFrom": "2020-01-01",
                        "dateTo": "2035-12-31",
                        "departmentId": None,
                        "projectId": project.id,
                    },
                    member_access,
                    datetime(2026, 1, 1),
                )
                assert hidden_id not in str(report["tasks"])
                assert (
                    next(item for item in report["projects"] if item["id"] == project.id)[
                        "tasksTotal"
                    ]
                    == 1
                )

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

            await session.execute(delete(Task).where(Task.id.in_(task_ids)))
            await session.execute(delete(Task).where(Task.projectId == project.id))
            await session.execute(
                delete(ProjectMember).where(ProjectMember.projectId == project.id)
            )
            from tests.audit_cleanup import clear_audit_logs_for_test_cleanup

            await clear_audit_logs_for_test_cleanup(session)
            await session.execute(delete(User).where(User.id == employee_user))
            await session.execute(delete(Employee).where(Employee.id.in_([first, second])))
            await session.execute(delete(Department).where(Department.id == prefix))
            await session.commit()
