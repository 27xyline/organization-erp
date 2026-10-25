"""Воспроизвести запись baseline2d9da58; нормализуются только сгенерированные идентификаторы и
время.
"""

import json
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import delete, func, select, update

from app.models.departments import Department
from app.models.employees import Employee
from app.models.notifications import NotificationOutbox
from app.models.projects import Project
from app.models.timekeeping import StaffSchedule
from app.models.users import AuditLog, User
from app.services.dto.projects import ProjectCommand, TaskCommand
from app.services.project_members import ProjectMemberService
from tests.audit_cleanup import clear_audit_logs_for_test_cleanup


@pytest.mark.anyio
async def test_projects_real_legacy_capture_state_audit_and_absent_outbox(project_env):
    projects, tasks, initial, context, sessions = project_env
    from app.db.uow import create_unit_of_work_factory

    members = ProjectMemberService(create_unit_of_work_factory(sessions))
    prefix = context.actor.actor_id
    golden = json.loads(
        (Path(__file__).parents[2] / "fixtures/contracts/projects.json").read_text()
    )
    async with sessions() as session:
        await clear_audit_logs_for_test_cleanup(session)
        await session.execute(delete(Project).where(Project.id == initial.id))
        await session.execute(delete(AuditLog).where(AuditLog.userId == prefix))
        await session.execute(
            update(User).where(User.id == prefix).values(name="Synthetic projects")
        )
        session.add(Department(id=prefix, code=prefix, name="<department>"))
        await session.flush()
        session.add(
            StaffSchedule(
                id=prefix,
                position="Synthetic engineer",
                department="<department>",
                departmentId=prefix,
                rate=1,
                salary=50000,
            )
        )
        await session.flush()
        session.add(
            Employee(
                id=prefix,
                code=prefix,
                fullName="Synthetic Member",
                department="<department>",
                departmentId=prefix,
                staffScheduleId=prefix,
                employmentRate=1,
            )
        )
        await session.commit()
    try:
        project = await projects.create(
            ProjectCommand(
                prefix,
                "Synthetic projects project",
                description="legacy parity",
                goals="scope",
                tasks="plan",
                results="done",
                startDate="2026-01-01",
                endDate="2026-12-31",
                plannedBudget=Decimal(120000),
                actualBudget=Decimal(3000),
            ),
            context,
        )
        project = await projects.update(
            project.id,
            ProjectCommand(
                prefix,
                "Synthetic projects project updated",
                description="legacy parity updated",
                goals="scope",
                tasks="plan",
                results="done",
                startDate="2026-01-02",
                endDate="2026-12-31",
                plannedBudget=Decimal(125000),
                actualBudget=Decimal(3500),
            ),
            context,
        )
        member = await members.add(project.id, prefix, context)
        common = dict(
            level=1,
            parentId=None,
            isMilestone=False,
            employeeIds=[prefix],
            progress=0,
            status="NOT_STARTED",
        )
        predecessor = await tasks.create(
            project.id,
            TaskCommand.from_values(
                common
                | dict(
                    name="Synthetic predecessor",
                    description="before successor",
                    priority="HIGH",
                    risk="LOW",
                    startDate="2026-02-01",
                    endDate="2026-02-03",
                    duration=2,
                    predecessorIds=[],
                    checklist=[],
                )
            ),
            context,
        )
        successor = await tasks.create(
            project.id,
            TaskCommand.from_values(
                common
                | dict(
                    name="Synthetic successor",
                    description="after predecessor",
                    priority="MEDIUM",
                    risk="MEDIUM",
                    startDate="2026-02-04",
                    endDate="2026-02-08",
                    duration=4,
                    predecessorIds=[predecessor.id],
                    checklist=[dict(title="Synthetic checklist", completed=False)],
                )
            ),
            context,
        )
        await tasks.update(
            successor.id,
            TaskCommand.from_values(
                dict(status="IN_PROGRESS", progress=20, name="Synthetic successor updated")
            ),
            context,
        )
        await tasks.add_comment(successor.id, "Synthetic comment", context)
        view = (await projects.get(project.id, context.actor, detail=True)).values
        archived = await members.update(project.id, member.id, True, context)
        deleted_task = await tasks.delete(predecessor.id, context)
        deleted_project = await projects.delete(project.id, context)
        async with sessions() as session:
            audits = (
                await session.scalars(
                    select(AuditLog).where(AuditLog.userId == prefix).order_by(AuditLog.createdAt)
                )
            ).all()
            outbox = await session.scalar(select(func.count()).select_from(NotificationOutbox))
            assert await session.get(Project, project.id) is None
        actual = {key: golden[key] for key in ("fixture", "source", "scenario")}
        actual["project"] = {
            key: project.values[key] for key in ("name", "status", "plannedBudget", "actualBudget")
        }
        actual["project"].update(
            code="<project-code>",
            startDate=project.startDate.date().isoformat(),
            _count=view["_count"],
        )
        actual["member"] = {
            key: member.values[key] for key in ("department", "position", "rate", "salary")
        }
        actual["member"]["isArchived"] = archived.isArchived
        actual["tasks"] = [
            dict(
                name=task["name"],
                status=task["status"],
                progress=task["progress"],
                predecessorNames=[edge["predecessor"]["name"] for edge in task["predecessors"]],
                checklist=[
                    {key: item[key] for key in ("title", "completed", "order")}
                    for item in task["checklist"]
                ],
                assignees=[
                    dict(employeeId="<employee>", projectMemberId="<member>")
                    for item in task["assignees"]
                ],
                comments=[
                    dict(body=item["body"], author=item["author"]["name"])
                    for item in task["comments"]
                ],
            )
            for task in view["tasksList"]
        ]
        actual["memberAfterArchive"] = dict(
            archived=archived.isArchived, archivedAt="<timestamp>" if archived.archivedAt else None
        )
        actual["auditActions"] = [row.action for row in audits]

        def normalized_details(value):
            if isinstance(value, dict):
                return {key: normalized_details(item) for key, item in value.items()}
            if value == prefix:
                return "<project-code>"
            if value == project.id:
                return "<project>"
            return value

        actual["auditRecords"] = [
            dict(
                action=row.action,
                entityType=row.entityType,
                details=normalized_details(row.details),
            )
            for row in audits
        ]
        actual["notificationOutboxCount"] = outbox
        actual["deleteResults"] = dict(task=deleted_task, project=deleted_project)
        assert actual == golden
    finally:
        async with sessions() as session:
            await session.execute(delete(Employee).where(Employee.id == prefix))
            await session.execute(delete(StaffSchedule).where(StaffSchedule.id == prefix))
            await session.execute(delete(Department).where(Department.id == prefix))
            await session.commit()
