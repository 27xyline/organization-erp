"""Collect the legacy scheduled notification sources and publish their intents."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date, datetime, time, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import RowMapping
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.context import RequestContext
from app.domain.ports.notifications import NotificationIntent
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.services.notification_intents import publish
from app.services.scheduled_alerts import AlertResult


def _date_key(value: date | datetime) -> str:
    return value.isoformat()[:10]


def _date_label(value: date | datetime) -> str:
    return value.strftime("%d.%m.%Y")


async def _query(
    session_factory: async_sessionmaker[AsyncSession], sql: str, **params: Any
) -> Sequence[RowMapping]:
    async with session_factory() as session:
        return (await session.execute(text(sql), params)).mappings().all()


async def _scoped_users(
    session_factory: async_sessionmaker[AsyncSession],
    role: str,
    scope_kind: str,
    scope_id: str,
) -> tuple[str, ...]:
    if scope_kind == "department":
        sql = """SELECT DISTINCT u."id" FROM "users" u
          JOIN "user_role_assignments" a ON a."userId" = u."id"
          LEFT JOIN "user_department_scopes" s ON s."roleAssignmentId" = a."id"
          WHERE u."isActive" AND a."role" IN ('ADMIN', :role)
            AND (a."departmentScopeMode" = 'ALL' OR
              (a."departmentScopeMode" = 'ASSIGNED' AND s."departmentId" = :scope_id))"""
    else:
        sql = """SELECT DISTINCT u."id" FROM "users" u
          JOIN "user_role_assignments" a ON a."userId" = u."id"
          LEFT JOIN "user_project_scopes" s ON s."roleAssignmentId" = a."id"
          WHERE u."isActive" AND a."role" IN ('ADMIN', :role)
            AND (a."projectScopeMode" = 'ALL' OR
              (a."projectScopeMode" = 'ASSIGNED' AND s."projectId" = :scope_id))"""
    rows = await _query(session_factory, sql, role=role, scope_id=scope_id)
    return tuple(sorted(str(row["id"]) for row in rows))


async def collect_scheduled_alerts(
    uow_factory: UnitOfWorkFactory[UnitOfWork],
    session_factory: async_sessionmaker[AsyncSession],
    now: datetime,
    context: RequestContext,
) -> AlertResult:
    day_start = datetime.combine(now.date(), time.min)
    end_30 = now + timedelta(days=30)
    end_1 = now + timedelta(days=1)
    start_30 = day_start - timedelta(days=30)
    alerts: list[dict[str, Any]] = []

    rows = await _query(
        session_factory,
        """SELECT e."id", e."fullName", e."contractEndDate", u."id" AS "userId"
      FROM "employees" e JOIN "users" u ON u."employeeId" = e."id"
      WHERE e."status" <> 'DISMISSED' AND u."isActive"
        AND e."contractEndDate" >= :start_day AND e."contractEndDate" <= :end_30""",
        start_day=day_start,
        end_30=end_30,
    )
    for row in rows:
        due = row["contractEndDate"]
        alerts.append(
            _alert(
                "contracts",
                (row["userId"],),
                "CONTRACT_EXPIRING",
                "Заканчивается трудовой договор",
                f"{row['fullName']}: договор действует до {_date_label(due)}",
                f"contract:{row['id']}:{_date_key(due)}",
                "/employees",
                "Employee",
                row["id"],
            )
        )

    rows = await _query(
        session_factory,
        """SELECT t."id", t."name", t."endDate", t."projectId", u."id" AS "userId"
      FROM "tasks" t JOIN "task_assignees" ta ON ta."taskId" = t."id"
      JOIN "employees" e ON e."id" = ta."employeeId"
      JOIN "users" u ON u."employeeId" = e."id" AND u."isActive"
      WHERE t."endDate" < :start_day AND t."status" <> 'COMPLETED' """,
        start_day=day_start,
    )
    for row in rows:
        due = row["endDate"]
        alerts.append(
            _alert(
                "tasks",
                (row["userId"],),
                "TASK_OVERDUE",
                "Просрочена задача",
                row["name"],
                f"task:{row['id']}:overdue:{_date_key(due)}",
                f"/projects/{row['projectId']}",
                "Task",
                row["id"],
            )
        )

    rows = await _query(
        session_factory,
        """SELECT a."id", a."name", a."inventoryNumber", a."plannedDisposalDate", m."departmentId"
      FROM "assets" a JOIN "mols" m ON m."id" = a."molId"
      WHERE NOT a."isArchived" AND a."plannedDisposalDate" >= :start_day
        AND a."plannedDisposalDate" <= :end_30""",
        start_day=day_start,
        end_30=end_30,
    )
    for row in rows:
        recipients = await _scoped_users(
            session_factory, "ASSET_CUSTODIAN", "department", row["departmentId"]
        )
        alerts.append(
            _alert(
                "assets",
                recipients,
                "ASSET_DISPOSAL_DUE",
                "Приближается срок списания имущества",
                f"{row['name']} ({row['inventoryNumber']})",
                f"asset:{row['id']}:disposal:{_date_key(row['plannedDisposalDate'])}",
                f"/assets/{row['id']}",
                "Asset",
                row["id"],
            )
        )

    rows = await _query(
        session_factory,
        '''SELECT p."id", p."code", p."name", p."updatedAt"
      FROM "projects" p WHERE p."status" = 'ACTIVE' AND p."plannedBudget" > 0
        AND p."actualBudget" > p."plannedBudget"''',
    )
    for row in rows:
        recipients = await _scoped_users(session_factory, "PROJECT_MANAGER", "project", row["id"])
        alerts.append(
            _alert(
                "budgets",
                recipients,
                "BUDGET_OVERRUN",
                "Бюджет проекта превышен",
                f"{row['code']} — {row['name']}",
                f"project:{row['id']}:budget:{_date_key(row['updatedAt'])}",
                f"/projects/{row['id']}",
                "Project",
                row["id"],
            )
        )

    rows = await _query(
        session_factory,
        """SELECT am."id", am."title", am."scheduledDate", a."id" AS "assetId",
      a."name" AS "assetName", a."inventoryNumber", m."departmentId"
      FROM "asset_maintenance" am JOIN "assets" a ON a."id" = am."assetId"
      JOIN "mols" m ON m."id" = a."molId"
      WHERE am."status" IN ('PLANNED', 'IN_PROGRESS') AND NOT a."isArchived"
        AND am."scheduledDate" >= :start_30 AND am."scheduledDate" <= :end_30""",
        start_30=start_30,
        end_30=end_30,
    )
    for row in rows:
        recipients = await _scoped_users(
            session_factory, "ASSET_CUSTODIAN", "department", row["departmentId"]
        )
        overdue = row["scheduledDate"] < day_start.date()
        title = (
            "Просрочено обслуживание имущества"
            if overdue
            else "Приближается срок обслуживания имущества"
        )
        alerts.append(
            _alert(
                "maintenance",
                recipients,
                "ASSET_MAINTENANCE_DUE",
                title,
                f"{row['assetName']} ({row['inventoryNumber']}): {row['title']}",
                f"asset-maintenance:{row['id']}:{_date_key(row['scheduledDate'])}",
                f"/assets/{row['assetId']}",
                "AssetMaintenance",
                row["id"],
            )
        )

    rows = await _query(
        session_factory,
        '''SELECT s."id", s."approverId", s."dueDate", r."id" AS "requestId",
      r."title" AS "requestTitle" FROM "approval_steps" s
      JOIN "approval_requests" r ON r."id" = s."requestId"
      WHERE s."status" = 'PENDING' AND s."dueDate" <= :end_1 AND NOT s."reminderSent"''',
        end_1=end_1,
    )
    for row in rows:
        due = _date_label(row["dueDate"]) if row["dueDate"] else ""
        reminder_body = (
            f'Tребуется решение по запросу №{row["requestId"]}: "{row["requestTitle"]}" до {due}'
        )
        alert = _alert(
            "approval-reminders",
            (row["approverId"],),
            "APPROVAL_REQUESTED",
            "Напоминание о согласовании",
            reminder_body,
            f"approval-reminder:{row['id']}",
            f"/approvals/{row['requestId']}",
            "ApprovalRequest",
            row["requestId"],
        )
        alert["after_publish_id"] = row["id"]
        alerts.append(alert)

    counts: dict[str, int] = {
        "contracts": 0,
        "tasks": 0,
        "assets": 0,
        "budgets": 0,
        "maintenance": 0,
        "approval-reminders": 0,
    }
    generated = email_queued = 0
    for alert in alerts:
        intent = NotificationIntent(
            user_id="",
            event_type=alert["event_type"],
            channel="IN_APP",
            title=alert["title"],
            body=alert["body"],
            dedupe_key=alert["dedupe_key"],
            payload={},
            target_url=alert["target_url"],
            entity_type=alert["entity_type"],
            entity_id=alert["entity_id"],
        )
        async with uow_factory() as uow:
            result = await publish(
                uow,
                tuple(alert["recipients"]),
                intent,
                actor_id=context.actor.actor_id if context.actor else None,
                request_id=context.request_id,
            )
            await uow.commit()
        if step_id := alert.get("after_publish_id"):
            async with session_factory() as session:
                await session.execute(
                    text(
                        'UPDATE "approval_steps" SET "reminderSent" = true '
                        'WHERE "id" = :id AND "status" = \'PENDING\' '
                        'AND NOT "reminderSent"'
                    ),
                    {"id": step_id},
                )
                await session.commit()
        counts[alert["source"]] = counts.get(alert["source"], 0) + result["created"]
        generated += result["created"]
        email_queued += result["emailQueued"]

    return AlertResult(ran=True, generated=generated, email_queued=email_queued, sources=counts)


def _alert(
    source: str,
    recipients: tuple[str, ...],
    event_type: str,
    title: str,
    body: str,
    dedupe_key: str,
    target_url: str,
    entity_type: str,
    entity_id: str,
) -> dict[str, Any]:
    return {
        "source": source,
        "recipients": recipients,
        "event_type": event_type,
        "title": title,
        "body": body,
        "dedupe_key": dedupe_key,
        "target_url": target_url,
        "entity_type": entity_type,
        "entity_id": entity_id,
    }
