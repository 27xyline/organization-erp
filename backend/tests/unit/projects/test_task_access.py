import pytest

from app.domain.auth.rules import AccessContext, ScopeGrant
from app.domain.ports.projects import TaskRecord
from app.domain.projects.task_visibility import visible_project_tasks


def test_employee_task_list_does_not_disclose_other_tasks_or_dependencies():
    access = AccessContext("u", "e", None, ("p",), (ScopeGrant("1", "EMPLOYEE", "SELF", "SELF"),))
    tasks = (
        TaskRecord.from_values(
            {
                "id": "a",
                "name": "A",
                "projectId": "p",
                "level": 1,
                "assignees": [{"employeeId": "e"}],
                "predecessors": [
                    {"predecessorId": "b", "predecessor": {"id": "b", "name": "Secret"}}
                ],
            }
        ),
        TaskRecord.from_values(
            {
                "id": "b",
                "name": "Secret",
                "projectId": "p",
                "level": 1,
                "assignees": [{"employeeId": "other"}],
            }
        ),
    )
    result = visible_project_tasks(tasks, access, "p")
    assert [task.id for task in result] == ["a"]
    assert result[0].predecessors == ()


def test_other_roles_keep_visibility_in_their_project_scope():
    tasks = (TaskRecord(id="a", projectId="p", name="A", level=1),)
    for role, department in (("AUDITOR", "ALL"), ("DEPARTMENT_HEAD", "ASSIGNED")):
        access = AccessContext(
            "u", "e", None, (), (ScopeGrant("1", role, department, "ASSIGNED", project_ids=("p",)),)
        )
        assert visible_project_tasks(tasks, access, "p") == tasks


def test_creator_is_not_exposed_in_task_values():
    task = TaskRecord(id="a", projectId=None, name="A", level=1, creatorId="private")
    assert "creatorId" not in task.values


def test_sql_task_visibility_respects_employee_assignment_and_other_role_scope():
    from sqlalchemy import create_engine, select, text

    from app.models.projects import Task
    from app.repositories.task_visibility import task_visibility

    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE tasks (id TEXT, "projectId" TEXT)'))
        connection.execute(
            text('CREATE TABLE task_assignees (id TEXT, "taskId" TEXT, "employeeId" TEXT)')
        )
        connection.execute(text("INSERT INTO tasks VALUES ('a', 'p'), ('b', 'p'), ('c', 'q')"))
        connection.execute(text("INSERT INTO task_assignees VALUES ('1', 'a', 'e')"))
        employee = AccessContext(
            "u", "e", None, ("p",), (ScopeGrant("1", "EMPLOYEE", "SELF", "SELF"),)
        )
        manager = AccessContext(
            "u",
            None,
            None,
            (),
            (ScopeGrant("1", "PROJECT_MANAGER", "NONE", "ASSIGNED", project_ids=("q",)),),
        )
        assert list(connection.scalars(select(Task.id).where(task_visibility(employee)))) == ["a"]
        assert list(connection.scalars(select(Task.id).where(task_visibility(manager)))) == ["c"]


@pytest.mark.anyio
async def test_update_hides_out_of_scope_project_task_like_unknown_task():
    from types import SimpleNamespace

    import pytest

    from app.core.context import Actor
    from app.domain.errors import DomainError
    from app.services.tasks import TaskService

    access = AccessContext("u", "e", None, (), (ScopeGrant("1", "EMPLOYEE", "SELF", "SELF"),))
    actor = Actor("u", is_authenticated=True, employee_id="e", access=access)

    class Repository:
        async def task(self, identifier):
            return (
                TaskRecord(id=identifier, projectId="hidden", name="Secret", level=1)
                if identifier == "hidden"
                else None
            )

    uow = SimpleNamespace(projects=Repository())
    service = TaskService(None)
    errors = []
    for identifier in ("hidden", "missing"):
        with pytest.raises(DomainError) as error:
            await service._existing(uow, identifier, actor, "tasks.update")
        errors.append((error.value.code, error.value.status_code))
    assert errors == [("TASK_NOT_FOUND", 404), ("TASK_NOT_FOUND", 404)]


@pytest.mark.anyio
async def test_employee_cannot_edit_general_task_created_by_another_user():

    from app.core.context import Actor, RequestContext
    from app.domain.errors import DomainError
    from app.services.dto.projects import TaskCommand
    from app.services.tasks import TaskService

    access = AccessContext(
        "employee-user", "employee", None, (), (ScopeGrant("1", "EMPLOYEE", "SELF", "SELF"),)
    )
    actor = Actor("employee-user", is_authenticated=True, employee_id="employee", access=access)

    class Repository:
        async def task(self, identifier):
            return TaskRecord(
                id=identifier, projectId=None, name="Other", level=1, creatorId="admin"
            )

    class UnitOfWork:
        projects = Repository()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

    service = TaskService(lambda: UnitOfWork())
    with pytest.raises(DomainError) as error:
        await service.update(
            "task", TaskCommand.from_values({"name": "Changed"}), RequestContext("r", actor=actor)
        )
    assert (error.value.code, error.value.status_code) == ("FORBIDDEN", 403)


def test_timekeeping_entry_hides_unassigned_task_reference():
    from datetime import date
    from types import SimpleNamespace

    from app.services.timekeeping import _visible_entry_values

    employee = SimpleNamespace(
        id="e", code="E", fullName="E", department="D", employmentRate=1, staffSchedule=None
    )
    row = SimpleNamespace(
        id="entry",
        employeeId="e",
        projectId="p",
        taskId="hidden",
        workDate=date(2026, 1, 1),
        type="REGULAR",
        hours=1,
        note=None,
        createdAt=None,
        updatedAt=None,
        employee=employee,
        project=None,
        task=SimpleNamespace(id="hidden", name="Secret"),
    )
    entry = _visible_entry_values(row, {"visible"})
    assert entry["taskId"] is None and entry["task"] is None
    assert _visible_entry_values(row, {"hidden"})["task"]["name"] == "Secret"


@pytest.mark.anyio
async def test_employee_can_create_and_update_general_task_with_self_assignment(monkeypatch):
    from app.core.context import Actor, RequestContext
    from app.domain.errors import DomainError
    from app.domain.ports.projects import GeneralAssignee
    from app.services.dto.projects import TaskCommand
    from app.services.tasks import TaskService

    access = AccessContext("u", "e", None, (), (ScopeGrant("1", "EMPLOYEE", "SELF", "SELF"),))
    actor = Actor("u", is_authenticated=True, employee_id="e", access=access)
    current = TaskRecord(id="t", projectId=None, name="Own", level=1, creatorId="u")

    class Repository:
        async def task(self, identifier):
            return current

        async def lock_task(self, identifier):
            return True

        async def general_assignees(self, identifiers, task_id=None):
            return tuple(
                GeneralAssignee(None, identifier, "Employee") for identifier in identifiers
            )

        async def create_task(self, project_id, values, members):
            return current

        async def update_task(self, identifier, values, members):
            return current

    class UnitOfWork:
        projects = Repository()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def commit(self):
            pass

    async def no_op(*args):
        pass

    monkeypatch.setattr("app.services.tasks.check_actor", no_op)
    monkeypatch.setattr("app.services.tasks.audit", no_op)
    service = TaskService(lambda: UnitOfWork())
    context = RequestContext("r", actor=actor)
    own = TaskCommand.from_values({"name": "Own", "employeeIds": ["e"]})
    assert (await service.create_general(own, context)).id == "t"
    assert (await service.update("t", own, context)).id == "t"
    other = TaskCommand.from_values({"name": "Wrong", "employeeIds": ["other"]})
    with pytest.raises(DomainError, match="только себя"):
        await service.create_general(other, context)
    with pytest.raises(DomainError, match="только себя"):
        await service.update("t", other, context)
