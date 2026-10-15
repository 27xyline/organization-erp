"""Bounded project reads and transactional writes. Never commits."""

from __future__ import annotations

import builtins
from collections.abc import Callable
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domain.auth.rules import AccessContext
from app.domain.ports.projects import (
    ActivityRecord,
    CommentRecord,
    MemberRecord,
    ProjectPage,
    ProjectRecord,
    TaskRecord,
    UserDisplay,
)
from app.models.assets import Asset, AssetHolding, Operation
from app.models.documents import Document
from app.models.employees import Employee
from app.models.finance import FinancePlanEntry
from app.models.projects import (
    Project,
    ProjectMember,
    Task,
    TaskAssignee,
    TaskChecklistItem,
    TaskComment,
    TaskDependency,
)
from app.models.users import AuditLog, UserProjectScope
from app.repositories.departments import _flush
from app.repositories.employees import columns, employee_loads


def decimal_string(value: Decimal) -> str:
    """Prisma Decimal.toJSON uses decimal notation without trailing scale zeros."""
    text = format(value, "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


def serial(row: Any) -> dict[str, Any]:
    values = columns(row)
    return {
        key: decimal_string(value) if isinstance(value, Decimal) else value
        for key, value in values.items()
    }


def project_record(row: Project) -> ProjectRecord:
    return ProjectRecord.from_values(serial(row))


def member_loads() -> Any:
    return selectinload(ProjectMember.employee).options(employee_loads())


def member_record(row: ProjectMember, salary: bool = True) -> MemberRecord:
    employee = row.employee
    staff = employee.staffSchedule
    values = serial(row)
    values["rate"] = f"{row.rate:.2f}"
    values["salary"] = f"{row.salary:.2f}" if salary else ""
    values["employee"] = {
        "id": employee.id,
        "code": employee.code,
        "fullName": employee.fullName,
        "department": employee.department,
        "employmentRate": f"{employee.employmentRate:.2f}",
        "status": employee.status,
        "staffSchedule": {
            "id": staff.id,
            "position": staff.position,
            "department": staff.department,
            "salary": f"{staff.salary:.2f}" if salary else "",
        }
        if staff
        else None,
    }
    return MemberRecord(**values)


class SqlAlchemyProjectRepository:
    def __init__(self, session: Callable[[], AsyncSession]) -> None:
        self._session = session

    async def lock(self, project_id: str) -> bool:
        # Called after the actor lock by every migrated graph/membership writer.
        return (
            await self._session().scalar(
                select(Project.id).where(Project.id == project_id).with_for_update()
            )
            is not None
        )

    async def list(
        self,
        page: int,
        page_size: int,
        status: str | None,
        allowed_ids: tuple[str, ...] | None,
        references: bool = False,
    ) -> ProjectPage:
        query = select(Project)
        if allowed_ids is not None:
            query = query.where(Project.id.in_(allowed_ids))
        if status:
            query = query.where(Project.status == status)
        total = (
            await self._session().scalar(select(func.count()).select_from(query.subquery())) or 0
        )
        rows = (
            await self._session().scalars(
                query.order_by(Project.createdAt.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        ).all()
        if references:
            return ProjectPage(
                tuple(
                    ProjectRecord.from_values(
                        {key: getattr(row, key) for key in ("id", "code", "name")}
                    )
                    for row in rows
                ),
                total,
            )
        task_counts = dict(
            (
                await self._session().execute(
                    select(Task.projectId, func.count())
                    .where(Task.projectId.in_([r.id for r in rows]))
                    .group_by(Task.projectId)
                )
            ).all()
        )
        asset_counts = dict(
            (
                await self._session().execute(
                    select(Asset.projectId, func.count())
                    .where(Asset.projectId.in_([r.id for r in rows]))
                    .group_by(Asset.projectId)
                )
            ).all()
        )
        return ProjectPage(
            tuple(
                ProjectRecord.from_values(
                    {
                        **serial(row),
                        "_count": {
                            "tasksList": task_counts.get(row.id, 0),
                            "assets": asset_counts.get(row.id, 0),
                        },
                    },
                )
                for row in rows
            ),
            total,
        )

    async def get(self, project_id: str) -> ProjectRecord | None:
        row = await self._session().get(Project, project_id)
        return project_record(row) if row else None

    async def create(self, values: dict[str, Any]) -> ProjectRecord:
        row = Project(**values)
        self._session().add(row)
        await _flush(self._session())
        await self._session().refresh(row)
        return project_record(row)

    async def update(self, project_id: str, values: dict[str, Any]) -> ProjectRecord:
        row = await self._session().get(Project, project_id)
        assert row is not None
        for key, value in values.items():
            setattr(row, key, value)
        await _flush(self._session())
        await self._session().refresh(row)
        return project_record(row)

    async def delete(self, project_id: str) -> None:
        await self._session().execute(delete(Project).where(Project.id == project_id))
        await _flush(self._session())

    async def assign_scopes(self, project_id: str, assignment_ids: tuple[str, ...]) -> None:
        self._session().add_all(
            [UserProjectScope(roleAssignmentId=key, projectId=project_id) for key in assignment_ids]
        )
        await _flush(self._session())

    async def task(self, task_id: str) -> TaskRecord | None:
        row = await self._session().get(Task, task_id, populate_existing=True)
        return TaskRecord.from_values(serial(row)) if row else None

    async def tasks(self, project_id: str, shape: str = "list") -> tuple[TaskRecord, ...]:
        session = self._session()
        rows = (
            await session.scalars(
                select(Task).where(Task.projectId == project_id).order_by(Task.createdAt)
            )
        ).all()
        if shape == "graph":
            return tuple(TaskRecord.from_values(serial(row)) for row in rows)
        if shape == "api":

            def simple(row: Task, depth: int = 0) -> dict[str, Any]:
                value = serial(row)
                if depth < 2:
                    value["children"] = [
                        simple(child, depth + 1) for child in rows if child.parentId == row.id
                    ]
                return value

            return tuple(TaskRecord.from_values(simple(row)) for row in rows)
        ids = [row.id for row in rows]
        assignees: dict[str, builtins.list[dict[str, Any]]] = {}
        raw_assignees: dict[str, builtins.list[dict[str, Any]]] = {}
        for item in await session.scalars(
            select(TaskAssignee)
            .where(TaskAssignee.taskId.in_(ids))
            .options(selectinload(TaskAssignee.employee), selectinload(TaskAssignee.projectMember))
        ):
            value = {
                "employeeId": item.employeeId,
                "fullName": item.employee.fullName,
                "projectMemberId": item.projectMemberId,
            }
            if shape == "detail":
                value = {
                    **serial(item),
                    "employee": {"id": item.employee.id, "fullName": item.employee.fullName},
                    "projectMember": {"id": item.projectMemberId} if item.projectMemberId else None,
                }
            assignees.setdefault(item.taskId, []).append(value)
            raw_assignees.setdefault(item.taskId, []).append(
                {
                    **serial(item),
                    "employee": {"id": item.employee.id, "fullName": item.employee.fullName},
                    "projectMember": {"id": item.projectMemberId} if item.projectMemberId else None,
                }
            )
        predecessors: dict[str, builtins.list[dict[str, Any]]] = {}
        for dependency in await session.scalars(
            select(TaskDependency)
            .where(TaskDependency.successorId.in_(ids))
            .options(selectinload(TaskDependency.predecessor))
            .order_by(TaskDependency.createdAt)
        ):
            predecessors.setdefault(dependency.successorId, []).append(
                {
                    **serial(dependency),
                    "predecessor": {
                        "id": dependency.predecessor.id,
                        "name": dependency.predecessor.name,
                    },
                }
            )
        checklist: dict[str, builtins.list[dict[str, Any]]] = {}
        for check in await session.scalars(
            select(TaskChecklistItem)
            .where(TaskChecklistItem.taskId.in_(ids))
            .order_by(TaskChecklistItem.order, TaskChecklistItem.createdAt)
        ):
            checklist.setdefault(check.taskId, []).append(serial(check))
        comments: dict[str, builtins.list[dict[str, Any]]] = {}
        ranked_comments = (
            select(
                TaskComment.id,
                func.row_number()
                .over(partition_by=TaskComment.taskId, order_by=TaskComment.createdAt.desc())
                .label("rank"),
            )
            .where(TaskComment.taskId.in_(ids))
            .subquery()
        )
        for comment in await session.scalars(
            select(TaskComment)
            .where(
                TaskComment.id.in_(select(ranked_comments.c.id).where(ranked_comments.c.rank <= 20))
            )
            .options(selectinload(TaskComment.author))
            .order_by(TaskComment.createdAt.desc())
        ):
            target = comments.setdefault(comment.taskId, [])
            if len(target) < 20:
                target.append(
                    {
                        **serial(comment),
                        "author": {"id": comment.author.id, "name": comment.author.name},
                    }
                )

        def task_value(row: Task, depth: int = 0, flatten: bool = False) -> dict[str, Any]:
            result = serial(row)
            if not flatten:
                result.update(
                    assignees=(raw_assignees if depth > 0 else assignees).get(row.id, []),
                    predecessors=predecessors.get(row.id, []),
                    checklist=checklist.get(row.id, []),
                    comments=comments.get(row.id, []),
                )
            if shape in ("list", "api") and depth < 2:
                result["children"] = [
                    task_value(child, depth + 1, shape == "api")
                    for child in rows
                    if child.parentId == row.id
                ]
            return result

        return tuple(
            TaskRecord.from_values(task_value(row, flatten=shape == "api")) for row in rows
        )

    async def dependencies(self, project_id: str) -> tuple[tuple[str, str], ...]:
        return tuple(
            (
                await self._session().execute(
                    select(TaskDependency.predecessorId, TaskDependency.successorId)
                    .join(Task, Task.id == TaskDependency.predecessorId)
                    .where(Task.projectId == project_id)
                )
            ).all()
        )

    async def active_members(
        self, project_id: str, employee_ids: tuple[str, ...]
    ) -> tuple[MemberRecord, ...]:
        rows = (
            await self._session().scalars(
                select(ProjectMember)
                .where(
                    ProjectMember.projectId == project_id,
                    ProjectMember.isArchived.is_(False),
                    ProjectMember.employeeId.in_(employee_ids),
                )
                .options(member_loads())
            )
        ).all()
        by_id = {row.employeeId: row for row in rows}
        return tuple(member_record(by_id[key]) for key in employee_ids if key in by_id)

    async def _relations(
        self, task_id: str, values: dict[str, Any], members: tuple[MemberRecord, ...] | None
    ) -> None:
        session = self._session()
        if members is not None:
            await session.execute(delete(TaskAssignee).where(TaskAssignee.taskId == task_id))
            session.add_all(
                [
                    TaskAssignee(
                        taskId=task_id, employeeId=member.employee_id, projectMemberId=member.id
                    )
                    for member in members
                ]
            )
        if "predecessorIds" in values:
            await session.execute(
                delete(TaskDependency).where(TaskDependency.successorId == task_id)
            )
            session.add_all(
                [
                    TaskDependency(predecessorId=key, successorId=task_id)
                    for key in values["predecessorIds"]
                ]
            )
        if "checklist" in values:
            await session.execute(
                delete(TaskChecklistItem).where(TaskChecklistItem.taskId == task_id)
            )
            session.add_all(
                [
                    TaskChecklistItem(taskId=task_id, order=index, **item)
                    for index, item in enumerate(values["checklist"])
                ]
            )
        await _flush(session)

    async def create_task(
        self, project_id: str, values: dict[str, Any], members: tuple[MemberRecord, ...]
    ) -> TaskRecord:
        data = {
            key: value
            for key, value in values.items()
            if key not in ("employeeIds", "predecessorIds", "checklist")
        }
        row = Task(projectId=project_id, **data)
        self._session().add(row)
        await _flush(self._session())
        await self._relations(row.id, values, members)
        result = next(
            item for item in await self.tasks(project_id, "mutation") if item.id == row.id
        )
        return result

    async def update_task(
        self, task_id: str, values: dict[str, Any], members: tuple[MemberRecord, ...] | None
    ) -> TaskRecord:
        row = await self._session().get(Task, task_id, populate_existing=True)
        assert row is not None
        for key, value in values.items():
            if key not in ("employeeIds", "predecessorIds", "checklist"):
                setattr(row, key, value)
        await self._relations(task_id, values, members)
        return next(
            item for item in await self.tasks(row.projectId, "mutation") if item.id == task_id
        )

    async def delete_task(self, task_id: str) -> None:
        await self._session().execute(delete(Task).where(Task.id == task_id))
        await _flush(self._session())

    async def comment(self, task_id: str, author_id: str, body: str) -> CommentRecord:
        row = TaskComment(taskId=task_id, authorId=author_id, body=body)
        self._session().add(row)
        await _flush(self._session())
        await self._session().refresh(row, ["author"])
        return CommentRecord(**serial(row), author=UserDisplay(row.author.id, row.author.name))

    async def members(self, project_id: str, include_salary: bool) -> tuple[MemberRecord, ...]:
        rows = (
            await self._session().scalars(
                select(ProjectMember)
                .join(Employee)
                .where(ProjectMember.projectId == project_id, ProjectMember.isArchived.is_(False))
                .options(member_loads())
                .order_by(ProjectMember.department, Employee.fullName)
            )
        ).all()
        return tuple(member_record(row, include_salary) for row in rows)

    async def add_member(
        self, project_id: str, employee_id: str, values: dict[str, Any]
    ) -> MemberRecord:
        row = await self._session().scalar(
            select(ProjectMember)
            .where(ProjectMember.projectId == project_id, ProjectMember.employeeId == employee_id)
            .options(member_loads())
        )
        if row is None:
            row = ProjectMember(projectId=project_id, employeeId=employee_id, **values)
            self._session().add(row)
        else:
            for key, value in values.items():
                setattr(row, key, value)
        await _flush(self._session())
        loaded = await self._session().scalar(
            select(ProjectMember)
            .where(ProjectMember.id == row.id)
            .options(member_loads())
            .execution_options(populate_existing=True)
        )
        assert loaded is not None
        return member_record(loaded)

    async def update_member(
        self, project_id: str, member_id: str, archived: bool
    ) -> MemberRecord | None:
        row = await self._session().scalar(
            select(ProjectMember)
            .where(ProjectMember.id == member_id, ProjectMember.projectId == project_id)
            .options(member_loads())
        )
        if row is None:
            return None
        row.isArchived = archived
        row.archivedAt = datetime.now() if archived else None
        await _flush(self._session())
        return member_record(row)

    async def activity(
        self, project_id: str, tasks: bool, documents: bool
    ) -> tuple[ActivityRecord, ...]:
        conditions = [(AuditLog.entityType == "Project") & (AuditLog.entityId == project_id)]
        if tasks:
            conditions.append(
                (AuditLog.entityType == "Task")
                & AuditLog.entityId.in_(select(Task.id).where(Task.projectId == project_id))
            )
        if documents:
            conditions.append(
                (AuditLog.entityType == "Document")
                & AuditLog.entityId.in_(select(Document.id).where(Document.projectId == project_id))
            )
        rows = await self._session().scalars(
            select(AuditLog)
            .where(or_(*conditions))
            .options(selectinload(AuditLog.user))
            .order_by(AuditLog.createdAt.desc())
            .limit(30)
        )
        return tuple(
            ActivityRecord(
                row.id,
                row.action,
                row.entityType,
                row.entityId,
                row.createdAt,
                UserDisplay(row.user.id, row.user.name, row.user.username) if row.user else None,
            )
            for row in rows
        )

    async def project_view(
        self, project_id: str, access: AccessContext, detail: bool = False
    ) -> ProjectRecord | None:
        project = await self.get(project_id)
        if project is None:
            return None
        values = dict(project.values)
        target = {"projectId": project_id}
        tasks = (
            await self.tasks(project_id, "detail" if detail else "api")
            if access.allows("tasks.read", target)
            else ()
        )
        values["tasksList"] = [task.values for task in tasks]
        assets = []
        if access.allows("assets.read", target):
            loads = [selectinload(Asset.mol), selectinload(Asset.group)]
            asset_rows = (
                await self._session().scalars(
                    select(Asset).where(Asset.projectId == project_id).options(*loads)
                )
            ).all()
            asset_ids = [row.id for row in asset_rows]
            operations: dict[str, builtins.list[dict[str, Any]]] = {}
            holdings: dict[str, builtins.list[dict[str, Any]]] = {}
            if detail:
                for item in await self._session().scalars(
                    select(Operation)
                    .where(
                        Operation.assetId.in_(asset_ids),
                        Operation.type.in_(["RECEIPT", "DISPOSAL"]),
                    )
                    .order_by(Operation.date.desc())
                ):
                    operations.setdefault(item.assetId, []).append(serial(item))
            else:
                for holding in await self._session().scalars(
                    select(AssetHolding)
                    .where(AssetHolding.assetId.in_(asset_ids))
                    .options(selectinload(AssetHolding.mol))
                ):
                    holdings.setdefault(holding.assetId, []).append(
                        {**serial(holding), "mol": serial(holding.mol)}
                    )
            for row in asset_rows:
                value = {
                    **serial(row),
                    "mol": serial(row.mol) if row.mol else None,
                    "group": serial(row.group) if row.group else None,
                }
                if detail:
                    value["operations"] = operations.get(row.id, [])
                else:
                    value["holdings"] = holdings.get(row.id, [])
                assets.append(value)
        values["assets"] = assets
        values["_count"] = {"assets": len(assets), "tasksList": len(tasks)}
        if detail:
            finance = []
            if access.allows("projectPayroll.read", target):
                for entry in await self._session().scalars(
                    select(FinancePlanEntry)
                    .where(FinancePlanEntry.projectId == project_id)
                    .options(selectinload(FinancePlanEntry.employee))
                    .order_by(FinancePlanEntry.createdAt.desc())
                ):
                    finance.append(
                        {
                            **serial(entry),
                            "employee": {
                                key: getattr(entry.employee, key)
                                for key in ("id", "fullName", "department")
                            },
                        }
                    )
            values["financePlanEntries"] = finance
            values["_count"]["financePlanEntries"] = len(finance)
        return ProjectRecord.from_values(values)
