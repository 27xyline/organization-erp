"""Task workflows: graph validation and all writes share a locked UoW."""

from __future__ import annotations

import builtins
from typing import Any

from app.core.context import Actor, RequestContext
from app.domain.errors import DomainError
from app.domain.ports.projects import CommentRecord, MemberRecord, TaskRecord
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.domain.projects.task_rules import (
    ensure_acyclic_dependencies,
    ensure_valid_task_hierarchy,
    invalid,
)
from app.services.dto.projects import TaskCommand
from app.services.employees import audit, authorize
from app.services.projects import lock_project, parse_date


def task_error() -> DomainError:
    return DomainError("TASK_NOT_FOUND", "Задача не найдена", 404)


class TaskService:
    def __init__(self, factory: UnitOfWorkFactory[UnitOfWork]) -> None:
        self._factory = factory

    async def list(self, project_id: str, actor: Actor) -> tuple[TaskRecord, ...]:
        authorize(actor, "tasks.read", {"projectId": project_id})
        async with self._factory() as uow:
            return await uow.projects.tasks(project_id)

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
        authorize(actor, permission, {"projectId": current.project_id})
        await lock_project(uow, current.project_id, actor)
        # The row may have been deleted while waiting for the project lock.
        current = await uow.projects.task(task_id)
        if current is None:
            raise task_error()
        return current

    async def update(
        self, task_id: str, command: TaskCommand, context: RequestContext
    ) -> TaskRecord:
        actor = context.actor
        assert actor is not None
        authorize(actor, "tasks.update")
        values = dict(command.values)
        async with self._factory() as uow:
            current = await self._existing(uow, task_id, actor, "tasks.update")
            members = (
                await self._members(uow, current.project_id, values["employeeIds"])
                if "employeeIds" in values
                else None
            )
            if "predecessorIds" in values:
                await self._dependencies(uow, current.project_id, task_id, values["predecessorIds"])
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
