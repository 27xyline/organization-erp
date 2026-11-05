"""SQL-предикат видимости проектных задач по полным наборам прав."""

from sqlalchemy import and_, exists, false, or_, select, true
from sqlalchemy.sql.elements import ColumnElement

from app.domain.auth.rules import AccessContext
from app.models.projects import Task, TaskAssignee


def task_visibility(access: AccessContext) -> ColumnElement[bool]:
    conditions: list[ColumnElement[bool]] = []
    for grant in access.grants_for("tasks.read"):
        ids = access._ids(grant, "project")
        scope: ColumnElement[bool] = true() if ids is None else Task.projectId.in_(ids)
        if grant.role == "EMPLOYEE":
            scope = and_(
                scope,
                exists(
                    select(TaskAssignee.id)
                    .where(
                        TaskAssignee.taskId == Task.id,
                        TaskAssignee.employeeId == access.employee_id,
                    )
                    .correlate(Task)
                ),
            )
        conditions.append(scope)
    return or_(*conditions) if conditions else false()
