"Рабочие процессы задач: проверка графа и записи в одной заблокированной единице работы."

from __future__ import annotations

import builtins
from typing import Any

from app.core.context import Actor, RequestContext
from app.domain.errors import DomainError
from app.domain.ports.projects import CommentRecord, GeneralAssignee, MemberRecord, TaskRecord
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.domain.projects.task_rules import (
    ensure_acyclic_dependencies,
    ensure_valid_task_hierarchy,
    invalid,
)
from app.domain.projects.task_visibility import full_project_task_access, visible_project_tasks
from app.services.dto.projects import TaskCommand
from app.services.employees import audit, authorize
from app.services.projects import check_actor, lock_project, parse_date


def task_error() -> DomainError:
    return DomainError("TASK_NOT_FOUND", "Задача не найдена", 404)


class TaskService:
    def __init__(self, factory: UnitOfWorkFactory[UnitOfWork]) -> None:
        self._factory = factory

    async def inbox(self, actor: Actor) -> tuple[dict[str, Any], ...]:
        authorize(actor, "tasks.read")
        assert actor.access is not None
        all_tasks = bool(set(actor.access.roles) & {"ADMIN", "PROJECT_MANAGER"})
        async with self._factory() as uow:
            grants = tuple(
                grant for grant in actor.access.grants_for("tasks.read") if grant.role != "EMPLOYEE"
            )
            scopes = tuple(actor.access._ids(grant, "project") for grant in grants)
            project_ids = tuple({project for scope in scopes if scope for project in scope})
            rows = await uow.projects.inbox(
                actor.access.employee_id if not all_tasks else None,
                any(scope is None for scope in scopes),
                project_ids,
            )
            result = []
            for task, assigned in rows:
                can_read_project = bool(
                    task.projectId
                    and actor.access.allows("projects.read", {"projectId": task.projectId})
                )
                summary: dict[str, Any] = {
                    "id": task.id,
                    "name": task.name,
                    "status": task.status,
                    "isGeneral": task.projectId is None,
                    "projectName": task.projectName,
                    "isAssignedToMe": assigned,
                    "canReadProject": can_read_project,
                }
                if can_read_project:
                    summary["projectId"] = task.projectId
                if task.projectId is None:
                    summary.update(
                        {
                            "description": task.description,
                            "priority": task.priority,
                            "risk": task.risk,
                            "startDate": task.startDate,
                            "endDate": task.endDate,
                            "assignees": task.assignees or (),
                            "canEdit": all_tasks
                            or (
                                "EMPLOYEE" in actor.access.roles
                                and task.creatorId == actor.actor_id
                            ),
                        }
                    )
                result.append(summary)
            return tuple(result)

    @staticmethod
    def _general_manager(actor: Actor) -> None:
        authorize(actor, "tasks.update")
        if actor.access is None or not set(actor.access.roles) & {"ADMIN", "PROJECT_MANAGER"}:
            raise DomainError("FORBIDDEN", "Недостаточно прав", 403)

    async def general_assignee_options(self, actor: Actor) -> tuple[GeneralAssignee, ...]:
        self._general_manager(actor)
        async with self._factory() as uow:
            return await uow.projects.general_assignee_options()

    async def create_general(self, command: TaskCommand, context: RequestContext) -> TaskRecord:
        actor = context.actor
        assert actor is not None
        authorize(actor, "tasks.read")
        assert actor.access is not None
        manager = bool(set(actor.access.roles) & {"ADMIN", "PROJECT_MANAGER"})
        if not manager and ("EMPLOYEE" not in actor.access.roles or not actor.access.employee_id):
            raise DomainError("FORBIDDEN", "Недостаточно прав", 403)
        values = dict(command.values)
        if not manager and values.get("employeeIds") != [actor.access.employee_id]:
            invalid("INVALID_ASSIGNEES", "Сотрудник может назначить только себя")
        values["creatorId"] = actor.actor_id
        if values.get("level", 1) != 1 or values.get("parentId") or values.get("predecessorIds"):
            invalid("INVALID_HIERARCHY", "Общие задачи не поддерживают вложенность и зависимости")
        async with self._factory() as uow:
            await check_actor(uow, actor)
            members = await self._general_assignees(uow, values.get("employeeIds", []))
            values["responsible"] = "\n".join(member.full_name for member in members) or None
            values["description"] = values.get("description") or None
            self._normalize(values)
            result = await uow.projects.create_task(None, values, members)
            await audit(uow, context, "TASK_CREATE", "Task", result.id, {"projectId": None})
            await uow.commit()
            return result

    async def _general_assignees(
        self, uow: UnitOfWork, employee_ids: builtins.list[str], task_id: str | None = None
    ) -> tuple[GeneralAssignee, ...]:
        members = await uow.projects.general_assignees(tuple(employee_ids), task_id)
        if len(members) != len(employee_ids):
            invalid("INVALID_ASSIGNEES", "Можно назначать только активных сотрудников")
        return members

    async def change_assigned_status(
        self, task_id: str, status: str, context: RequestContext
    ) -> TaskRecord:
        actor = context.actor
        assert actor is not None
        authorize(actor, "tasks.read")
        assert actor.access is not None
        employee_id = actor.access.employee_id
        roles = set(actor.access.roles)
        if not roles & {"EMPLOYEE", "ADMIN", "PROJECT_MANAGER"}:
            raise DomainError("FORBIDDEN", "Недостаточно прав", 403)
        if not employee_id:
            raise DomainError("FORBIDDEN", "Недостаточно прав", 403)
        async with self._factory() as uow:
            await check_actor(uow, actor)
            if not await uow.projects.task_assigned(task_id, employee_id):
                raise task_error()
            current = await uow.projects.task(task_id)
            if current is None:
                raise task_error()
            if "EMPLOYEE" not in roles:
                if current.project_id:
                    authorize(actor, "tasks.update", {"projectId": current.project_id})
                else:
                    self._general_manager(actor)
            if current.project_id:
                if not await uow.projects.lock(current.project_id):
                    raise task_error()
            if not await uow.projects.lock_task(task_id):
                raise task_error()
            if not await uow.projects.task_assigned(task_id, employee_id):
                raise task_error()
            result = await uow.projects.update_task_status(task_id, status)
            await audit(
                uow, context, "TASK_UPDATE", "Task", task_id, {"projectId": current.project_id}
            )
            await uow.commit()
            return result

    async def list(self, project_id: str, actor: Actor) -> tuple[TaskRecord, ...]:
        authorize(actor, "tasks.read", {"projectId": project_id})
        async with self._factory() as uow:
            rows = await uow.projects.tasks(project_id)
            assert actor.access is not None
            return visible_project_tasks(rows, actor.access, project_id)

    async def create(
        self, project_id: str, command: TaskCommand, context: RequestContext
    ) -> TaskRecord:
        actor = context.actor
        assert actor is not None
        authorize(actor, "tasks.create", {"projectId": project_id})
        values = dict(command.values)
        async with self._factory() as uow:
            await lock_project(uow, project_id, actor)
            parent_id = values.get("parentId")
            parent = await uow.projects.task(parent_id) if parent_id else None
            ensure_valid_task_hierarchy(
                project_id,
                values.get("level", 1),
                parent_id,
                (parent.project_id, parent.level) if parent else None,
            )
            members = await self._members(uow, project_id, values.get("employeeIds", []))
            await self._dependencies(uow, project_id, None, values.get("predecessorIds", []))
            values["description"] = values.get("description") or None
            values["responsible"] = "\n".join(member.full_name for member in members) or None
            self._normalize(values)
            result = await uow.projects.create_task(project_id, values, members)
            await audit(
                uow,
                context,
                "TASK_CREATE",
                "Task",
                result.id,
                {
                    "projectId": project_id,
                    "priority": result.values["priority"],
                    "risk": result.values["risk"],
                },
            )
            await uow.commit()
            return result

    async def _existing(
        self, uow: UnitOfWork, task_id: str, actor: Actor, permission: str
    ) -> TaskRecord:
        current = await uow.projects.task(task_id)
        if current is None:
            raise task_error()
        if current.project_id is None:
            if (
                permission == "tasks.update"
                and actor.access
                and "EMPLOYEE" in actor.access.roles
                and current.creatorId == actor.actor_id
            ):
                pass
            else:
                self._general_manager(actor)
            await check_actor(uow, actor)
            if not await uow.projects.lock_task(task_id):
                raise task_error()
        else:
            access = actor.access
            if access is None or not access.allows("tasks.read", {"projectId": current.project_id}):
                raise task_error()
            if not full_project_task_access(access, current.project_id):
                if not access.employee_id or not await uow.projects.task_assigned(
                    task_id, access.employee_id
                ):
                    raise task_error()
            authorize(actor, permission, {"projectId": current.project_id})
            await lock_project(uow, current.project_id, actor)
        # Строка могла быть удалена, пока код ожидал блокировку проекта.
        current = await uow.projects.task(task_id)
        if current is None:
            raise task_error()
        return current

    async def update(
        self, task_id: str, command: TaskCommand, context: RequestContext
    ) -> TaskRecord:
        actor = context.actor
        assert actor is not None
        authorize(actor, "tasks.read")
        values = dict(command.values)
        async with self._factory() as uow:
            current = await self._existing(uow, task_id, actor, "tasks.update")
            if (
                current.project_id is None
                and actor.access
                and not set(actor.access.roles) & {"ADMIN", "PROJECT_MANAGER"}
            ):
                if "employeeIds" in values and values["employeeIds"] != [actor.access.employee_id]:
                    invalid("INVALID_ASSIGNEES", "Сотрудник может назначить только себя")
            members = (
                await (
                    self._members(uow, current.project_id, values["employeeIds"])
                    if current.project_id
                    else self._general_assignees(uow, values["employeeIds"], task_id)
                )
                if "employeeIds" in values
                else None
            )
            if "predecessorIds" in values:
                if current.project_id:
                    await self._dependencies(
                        uow, current.project_id, task_id, values["predecessorIds"]
                    )
                elif values["predecessorIds"]:
                    invalid("INVALID_DEPENDENCY", "Общие задачи не поддерживают зависимости")
            if members is not None:
                values["responsible"] = "\n".join(member.full_name for member in members) or None
            self._normalize(values)
            result = await uow.projects.update_task(task_id, values, members)
            await audit(
                uow, context, "TASK_UPDATE", "Task", task_id, {"projectId": current.project_id}
            )
            await uow.commit()
            return result

    async def add_comment(self, task_id: str, body: str, context: RequestContext) -> CommentRecord:
        actor = context.actor
        assert actor is not None
        authorize(actor, "tasks.update")
        async with self._factory() as uow:
            current = await self._existing(uow, task_id, actor, "tasks.update")
            result = await uow.projects.comment(task_id, actor.actor_id, body)
            await audit(
                uow, context, "TASK_COMMENT", "Task", task_id, {"projectId": current.project_id}
            )
            await uow.commit()
            return result

    async def delete(self, task_id: str, context: RequestContext) -> dict[str, bool]:
        actor = context.actor
        assert actor is not None
        authorize(actor, "tasks.delete")
        async with self._factory() as uow:
            current = await self._existing(uow, task_id, actor, "tasks.delete")
            await audit(
                uow, context, "TASK_DELETE", "Task", task_id, {"projectId": current.project_id}
            )
            await uow.projects.delete_task(task_id)
            await uow.commit()
            return {"success": True}

    async def _members(
        self, uow: UnitOfWork, project_id: str, employee_ids: builtins.list[str]
    ) -> tuple[MemberRecord, ...]:
        members = await uow.projects.active_members(project_id, tuple(employee_ids))
        if len(members) != len(employee_ids):
            invalid("INVALID_ASSIGNEES", "Можно назначать только активных участников проекта")
        return members

    async def _dependencies(
        self,
        uow: UnitOfWork,
        project_id: str,
        task_id: str | None,
        predecessor_ids: builtins.list[str],
    ) -> None:
        if not predecessor_ids:
            return
        if task_id in predecessor_ids:
            invalid("INVALID_DEPENDENCY", "Задача не может зависеть от самой себя")
        tasks = await uow.projects.tasks(project_id, "graph")
        task_ids = tuple(task.id for task in tasks)
        if any(key not in task_ids for key in predecessor_ids):
            invalid("INVALID_DEPENDENCY", "Предшествующая задача не найдена в проекте")
        if task_id:
            edges = await uow.projects.dependencies(project_id)
            ensure_acyclic_dependencies(
                task_ids,
                tuple(edge for edge in edges if edge[1] != task_id)
                + tuple((key, task_id) for key in predecessor_ids),
            )

    @staticmethod
    def _normalize(values: dict[str, Any]) -> None:
        for key in ("startDate", "endDate"):
            if key in values:
                values[key] = parse_date(values[key])
        if values.get("isMilestone"):
            values["duration"] = 0
