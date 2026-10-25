"""Collect the legacy scheduled notification sources and publish their intents."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any

from app.core.context import RequestContext
from app.domain.ports.notifications import NotificationIntent
from app.domain.ports.scheduled_alerts import ScheduledAlertQueries
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.services.dto.scheduled_alerts import AlertResult
from app.services.notification_intents import publish


def _date_key(value: date | datetime) -> str:
    return value.isoformat()[:10]


def _date_label(value: date | datetime) -> str:
    return value.strftime("%d.%m.%Y")


async def collect_scheduled_alerts(
    uow_factory: UnitOfWorkFactory[UnitOfWork],
    queries: ScheduledAlertQueries,
    now: datetime,
    context: RequestContext,
) -> AlertResult:
    day_start = datetime.combine(now.date(), time.min)
    end_30 = now + timedelta(days=30)
    end_1 = now + timedelta(days=1)
    start_30 = day_start - timedelta(days=30)
    alerts: list[dict[str, Any]] = []

    rows = await queries.contracts(day_start, end_30)
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

    rows = await queries.overdue_tasks(day_start)
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

    rows = await queries.assets_for_disposal(day_start, end_30)
    for row in rows:
        recipients = await queries.users_in_scope(
            "ASSET_CUSTODIAN", "department", row["departmentId"]
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

    rows = await queries.over_budget_projects()
    for row in rows:
        recipients = await queries.users_in_scope("PROJECT_MANAGER", "project", row["id"])
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

    rows = await queries.maintenance(start_30, end_30)
    for row in rows:
        recipients = await queries.users_in_scope(
            "ASSET_CUSTODIAN", "department", row["departmentId"]
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

    rows = await queries.approval_reminders(end_1)
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
            await queries.mark_approval_reminder_sent(step_id)
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
