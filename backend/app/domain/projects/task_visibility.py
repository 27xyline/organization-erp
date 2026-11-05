"""Фильтрация проектных задач и ссылок на скрытые задачи."""

from dataclasses import replace

from app.domain.auth.rules import AccessContext
from app.domain.ports.projects import TaskRecord


def full_project_task_access(access: AccessContext, project_id: str) -> bool:
    for grant in access.grants_for("tasks.read"):
        if grant.role == "EMPLOYEE":
            continue
        ids = access._ids(grant, "project")
        if ids is None or project_id in ids:
            return True
    return False


def visible_project_tasks(
    tasks: tuple[TaskRecord, ...], access: AccessContext, project_id: str
) -> tuple[TaskRecord, ...]:
    if full_project_task_access(access, project_id):
        return tasks
    visible = tuple(
        task
        for task in tasks
        if access.employee_id
        and any(item.get("employeeId") == access.employee_id for item in (task.assignees or ()))
    )
    ids = {task.id for task in visible}

    def clean(task: TaskRecord) -> TaskRecord:
        return replace(
            task,
            parentId=task.parentId if task.parentId in ids else None,
            children=tuple(clean(child) for child in (task.children or ()) if child.id in ids),
            predecessors=tuple(
                item for item in (task.predecessors or ()) if item.get("predecessorId") in ids
            ),
        )

    return tuple(clean(task) for task in visible)
