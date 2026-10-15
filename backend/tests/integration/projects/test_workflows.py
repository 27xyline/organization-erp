"""Real PostgreSQL acceptance: graph state, actor checks and transaction rollback."""

import asyncio
from dataclasses import replace

import pytest
from sqlalchemy import func, select

from app.db.uow import create_unit_of_work_factory
from app.domain.auth.rules import ScopeGrant
from app.domain.errors import DomainError
from app.models.projects import Task, TaskChecklistItem, TaskComment, TaskDependency
from app.models.users import AuditLog
from app.services.dto.projects import ProjectCommand, TaskCommand


def command(name, **values):
    return TaskCommand.from_values(
        dict(
            name=name,
            level=1,
            parentId=None,
            employeeIds=[],
            predecessorIds=[],
            checklist=[],
            startDate=None,
            endDate=None,
            duration=None,
            priority="MEDIUM",
            risk="LOW",
            status="NOT_STARTED",
            progress=0,
            isMilestone=False,
            **values,
        )
    )


@pytest.mark.anyio
async def test_invalid_dependency_rolls_back_task_and_audit(project_env):
    _, service, project, context, sessions = project_env
    first = await service.create(project.id, command("first"), context)
    second = await service.create(project.id, command("second"), context)
    await service.update(
        second.id, TaskCommand.from_values({"predecessorIds": [first.id]}), context
    )
    async with sessions() as session:
        before = await session.scalar(
            select(func.count())
            .select_from(AuditLog)
            .where(AuditLog.userId == context.actor.actor_id)
        )
    with pytest.raises(DomainError) as error:
        await service.update(
            first.id,
            TaskCommand.from_values(
                {
                    "name": "must rollback",
                    "predecessorIds": [second.id],
                    "checklist": [{"title": "bad", "completed": False}],
                }
            ),
            context,
        )
    assert error.value.code == "INVALID_DEPENDENCY"
    async with sessions() as session:
        assert (await session.get(Task, first.id)).name == "first"
        assert (
            await session.scalar(
                select(func.count())
                .select_from(AuditLog)
                .where(AuditLog.userId == context.actor.actor_id)
            )
            == before
        )
        assert (
            await session.scalar(
                select(func.count())
                .select_from(TaskChecklistItem)
                .where(TaskChecklistItem.taskId == first.id)
            )
            == 0
        )


@pytest.mark.anyio
async def test_status_only_patch_and_parent_delete_preserve_child(project_env):
    _, service, project, context, sessions = project_env
    parent = await service.create(project.id, command("parent"), context)
    values = command("child").values | {
        "level": 2,
        "parentId": parent.id,
        "predecessorIds": [parent.id],
    }
    child = await service.create(project.id, TaskCommand.from_values(values), context)
    await service.add_comment(parent.id, "comment", context)
    await service.update(
        parent.id,
        TaskCommand.from_values({"checklist": [{"title": "one", "completed": False}]}),
        context,
    )
    patched = await service.update(
        child.id, TaskCommand.from_values({"status": "IN_PROGRESS"}), context
    )
    assert patched.values["name"] == "child"
    assert patched.values["parentId"] == parent.id
    assert patched.values["predecessors"][0]["predecessorId"] == parent.id
    await service.delete(parent.id, context)
    async with sessions() as session:
        assert (await session.get(Task, child.id)).parentId is None
        for model in (TaskDependency, TaskChecklistItem, TaskComment):
            assert await session.scalar(select(func.count()).select_from(model)) >= 0
        assert (
            await session.scalar(
                select(func.count())
                .select_from(TaskDependency)
                .where(TaskDependency.predecessorId == parent.id)
            )
            == 0
        )
        assert (
            await session.scalar(
                select(func.count())
                .select_from(TaskChecklistItem)
                .where(TaskChecklistItem.taskId == parent.id)
            )
            == 0
        )
        assert (
            await session.scalar(
                select(func.count()).select_from(TaskComment).where(TaskComment.taskId == parent.id)
            )
            == 0
        )


@pytest.mark.anyio
async def test_concurrent_dependency_updates_cannot_create_cycle(project_env, monkeypatch):
    _, service, project, context, sessions = project_env
    first = await service.create(project.id, command("first"), context)
    second = await service.create(project.id, command("second"), context)
    from app.models.users import User
    from app.repositories.projects import SqlAlchemyProjectRepository

    other_id = context.actor.actor_id + "-other-actor"
    async with sessions() as session:
        session.add(
            User(
                id=other_id,
                username=other_id,
                name="Other actor",
                passwordHash="unused",
                mustChangePassword=False,
                role="ADMIN",
            )
        )
        await session.commit()
    other = replace(
        context,
        actor=replace(
            context.actor, actor_id=other_id, access=replace(context.actor.access, user_id=other_id)
        ),
    )
    both_actors_locked = asyncio.Event()
    entrants = 0
    original_lock = SqlAlchemyProjectRepository.lock

    async def synchronized_project_lock(repository, project_id):
        nonlocal entrants
        entrants += 1
        if entrants == 2:
            both_actors_locked.set()
        await asyncio.wait_for(both_actors_locked.wait(), timeout=5)
        return await original_lock(repository, project_id)

    monkeypatch.setattr(SqlAlchemyProjectRepository, "lock", synchronized_project_lock)
    results = await asyncio.gather(
        service.update(first.id, TaskCommand.from_values({"predecessorIds": [second.id]}), context),
        service.update(second.id, TaskCommand.from_values({"predecessorIds": [first.id]}), other),
        return_exceptions=True,
    )
    assert (
        sum(
            isinstance(result, DomainError) and result.code == "INVALID_DEPENDENCY"
            for result in results
        )
        == 1
    )
    async with sessions() as session:
        assert (
            await session.scalar(
                select(func.count())
                .select_from(TaskDependency)
                .where(TaskDependency.successorId.in_([first.id, second.id]))
            )
            == 1
        )


@pytest.mark.anyio
async def test_scope_and_stale_actor_deny_direct_mutations(project_env):
    _, service, project, context, _ = project_env
    task = await service.create(project.id, command("first"), context)
    stale = replace(context, actor=replace(context.actor, session_version=0))
    with pytest.raises(DomainError) as error:
        await service.update(task.id, TaskCommand.from_values({"name": "bad"}), stale)
    assert error.value.code == "UNAUTHENTICATED"
    forced = replace(context, actor=replace(context.actor, must_change_password=True))
    with pytest.raises(DomainError) as error:
        await service.delete(task.id, forced)
    assert error.value.code == "PASSWORD_CHANGE_REQUIRED"
    scoped = replace(
        context.actor.access,
        grants=(
            ScopeGrant("scope", "PROJECT_MANAGER", "NONE", "ASSIGNED", project_ids=("other",)),
        ),
    )
    with pytest.raises(DomainError) as error:
        await service.update(
            task.id,
            TaskCommand.from_values({"name": "bad"}),
            replace(context, actor=replace(context.actor, access=scoped)),
        )
    assert error.value.code == "FORBIDDEN"


@pytest.mark.anyio
async def test_injected_audit_failure_rolls_back_relations_and_business_state(
    project_env, monkeypatch
):
    from app.models.notifications import NotificationOutbox
    from app.repositories.audit import SqlAlchemyAuditRepository

    _, service, project, context, sessions = project_env
    task = await service.create(project.id, command("before"), context)
    async with sessions() as session:
        audit_count = await session.scalar(
            select(func.count())
            .select_from(AuditLog)
            .where(AuditLog.userId == context.actor.actor_id)
        )
        outbox_count = await session.scalar(select(func.count()).select_from(NotificationOutbox))
    original = SqlAlchemyAuditRepository.append

    async def fail_after_append(repository, record):
        await original(repository, record)
        raise RuntimeError("injected Stage06 failure after audit")

    monkeypatch.setattr(SqlAlchemyAuditRepository, "append", fail_after_append)
    with pytest.raises(RuntimeError, match="injected Stage06"):
        await service.update(
            task.id,
            TaskCommand.from_values(
                {"name": "after", "checklist": [{"title": "bad", "completed": True}]}
            ),
            context,
        )
    async with sessions() as session:
        assert (await session.get(Task, task.id)).name == "before"
        assert (
            await session.scalar(
                select(func.count())
                .select_from(TaskChecklistItem)
                .where(TaskChecklistItem.taskId == task.id)
            )
            == 0
        )
        assert (
            await session.scalar(
                select(func.count())
                .select_from(AuditLog)
                .where(AuditLog.userId == context.actor.actor_id)
            )
            == audit_count
        )
        assert (
            await session.scalar(select(func.count()).select_from(NotificationOutbox))
            == outbox_count
        )


@pytest.mark.anyio
async def test_cross_project_parent_dependencies_and_member_denied(project_env):
    projects, service, project, context, _ = project_env
    other = await projects.create(
        ProjectCommand(context.actor.actor_id + "-other", "Other"), context
    )
    foreign = await service.create(other.id, command("foreign"), context)
    with pytest.raises(DomainError) as error:
        await service.create(
            project.id,
            TaskCommand.from_values(command("bad").values | {"parentId": foreign.id, "level": 2}),
            context,
        )
    assert error.value.code == "INVALID_HIERARCHY"
    with pytest.raises(DomainError) as error:
        await service.create(
            project.id,
            TaskCommand.from_values(command("bad").values | {"predecessorIds": [foreign.id]}),
            context,
        )
    assert error.value.code == "INVALID_DEPENDENCY"
    with pytest.raises(DomainError) as error:
        await service.create(
            project.id,
            TaskCommand.from_values(command("bad").values | {"employeeIds": ["nonmember"]}),
            context,
        )
    assert error.value.code == "INVALID_ASSIGNEES"


@pytest.mark.anyio
async def test_scoped_lists_references_activity_visibility_and_bounded_loading(project_env):
    from sqlalchemy import event

    from app.services.dto.projects import ProjectListQuery
    from app.services.project_workspace import ProjectWorkspaceService

    projects, service, project, context, sessions = project_env
    await service.create(project.id, command("first"), context)
    other = await projects.create(
        ProjectCommand(context.actor.actor_id + "-other", "Other"), context
    )
    await service.create(other.id, command("foreign"), context)
    scoped_access = replace(
        context.actor.access,
        grants=(
            ScopeGrant("scope", "PROJECT_MANAGER", "NONE", "ASSIGNED", project_ids=(project.id,)),
        ),
    )
    scoped = replace(context.actor, access=scoped_access)
    result = await projects.list(ProjectListQuery(), scoped)
    assert [item.id for item in result.projects] == [project.id] and result.total == 1
    with pytest.raises(DomainError) as error:
        await projects.get(other.id, scoped)
    assert error.value.code == "FORBIDDEN"
    custodian = replace(
        context.actor,
        access=replace(
            context.actor.access,
            grants=(ScopeGrant("custodian", "ASSET_CUSTODIAN", "ALL", "NONE"),),
        ),
    )
    refs = await projects.list(ProjectListQuery(), custodian, references=True)
    assert {item.id for item in refs.projects} == {project.id, other.id}
    assert all(set(item.values) == {"id", "code", "name"} for item in refs.projects)
    accountant = replace(
        context.actor,
        access=replace(
            context.actor.access,
            grants=(
                ScopeGrant(
                    "accountant", "ACCOUNTANT", "ALL", "ASSIGNED", project_ids=(project.id,)
                ),
            ),
        ),
    )
    view = await projects.get(project.id, accountant, detail=True)
    assert view.tasksList == () and view.counts["tasksList"] == 0
    events = await ProjectWorkspaceService(create_unit_of_work_factory(sessions)).activity(
        project.id, accountant
    )
    assert events and {item.entityType for item in events} == {"Project"}
    events = await ProjectWorkspaceService(create_unit_of_work_factory(sessions)).activity(
        project.id, scoped
    )
    assert {"Project", "Task"} == {item.entityType for item in events}
    queries = []

    def count_query(conn, cursor, statement, parameters, context, executemany):
        queries.append(statement)

    engine = sessions.kw["bind"].sync_engine
    event.listen(engine, "before_cursor_execute", count_query)
    try:
        await service.list(project.id, scoped)
        first_count = len(queries)
        event.remove(engine, "before_cursor_execute", count_query)
        for index in range(5):
            await service.create(project.id, command(str(index)), context)
        queries.clear()
        event.listen(engine, "before_cursor_execute", count_query)
        tasks = await service.list(project.id, scoped)
        assert len(tasks) == 6 and first_count == len(queries)
    finally:
        event.remove(engine, "before_cursor_execute", count_query)


@pytest.mark.anyio
async def test_scope_update_and_task_mutation_use_actor_then_project_without_deadlock(
    project_env, monkeypatch
):
    from app.integrations.password_hash import Argon2PasswordHasher
    from app.models.users import UserProjectScope
    from app.repositories.users import SqlAlchemyUserRepository
    from app.services.users import UserService

    _, tasks, project, context, sessions = project_env
    task = await tasks.create(project.id, command("before"), context)
    actor_locked = asyncio.Event()
    graph_requests_actor = asyncio.Event()
    original_get = SqlAlchemyUserRepository.get
    original_update = SqlAlchemyUserRepository.update

    async def observed_get(repository, identifier, *, for_update=False):
        if asyncio.current_task().get_name() == "stage06-graph" and for_update:
            graph_requests_actor.set()
        return await original_get(repository, identifier, for_update=for_update)

    async def paused_scope_update(repository, identifier, values, assignments):
        actor_locked.set()
        await graph_requests_actor.wait()
        return await original_update(repository, identifier, values, assignments)

    monkeypatch.setattr(SqlAlchemyUserRepository, "get", observed_get)
    monkeypatch.setattr(SqlAlchemyUserRepository, "update", paused_scope_update)
    users = UserService(create_unit_of_work_factory(sessions), Argon2PasswordHasher())
    assignments = [
        dict(
            role="ADMIN",
            departmentScopeMode="ALL",
            projectScopeMode="ALL",
            departmentIds=[],
            projectIds=[],
        ),
        dict(
            role="PROJECT_MANAGER",
            departmentScopeMode="NONE",
            projectScopeMode="ASSIGNED",
            departmentIds=[],
            projectIds=[project.id],
        ),
    ]
    scope_task = asyncio.create_task(
        users.update(context.actor.actor_id, {"assignments": assignments}, context),
        name="stage06-scope",
    )
    await asyncio.wait_for(actor_locked.wait(), timeout=5)
    graph_task = asyncio.create_task(
        tasks.update(task.id, TaskCommand.from_values({"name": "after"}), context),
        name="stage06-graph",
    )
    results = await asyncio.wait_for(
        asyncio.gather(scope_task, graph_task, return_exceptions=True), timeout=10
    )
    assert isinstance(results[0], dict), results
    assert isinstance(results[1], DomainError) and results[1].code == "UNAUTHENTICATED", results
    async with sessions() as session:
        assert (await session.get(Task, task.id)).name == "before"
        assert (
            await session.scalar(
                select(func.count())
                .select_from(UserProjectScope)
                .where(UserProjectScope.projectId == project.id)
            )
            == 1
        )


@pytest.mark.anyio
async def test_current_database_password_flag_blocks_project_create(project_env):
    from sqlalchemy import update

    from app.models.users import User

    projects, _, _, context, sessions = project_env
    async with sessions() as session:
        await session.execute(
            update(User).where(User.id == context.actor.actor_id).values(mustChangePassword=True)
        )
        await session.commit()
    with pytest.raises(DomainError) as error:
        await projects.create(ProjectCommand(context.actor.actor_id + "-denied", "Denied"), context)
    assert error.value.code == "PASSWORD_CHANGE_REQUIRED"
