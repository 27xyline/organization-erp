from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime

import pytest

from app.core.context import RequestContext
from app.domain.ports.notifications import NotificationDeliveryPlan, NotificationProduceResult
from app.services.dto.scheduled_alerts import AlertResult
from app.services.scheduled_alert_generation import collect_scheduled_alerts
from app.services.scheduled_alerts import ScheduledAlertContext, run_scheduled_alerts


class FakeQueries:
    def __init__(self) -> None:
        self.events: list[str] = []

    async def contracts(self, start_day, end_30):
        self.events.append("contracts")
        return []

    async def overdue_tasks(self, start_day):
        self.events.append("overdue_tasks")
        return []

    async def assets_for_disposal(self, start_day, end_30):
        self.events.append("assets_for_disposal")
        return []

    async def users_in_scope(self, role, scope_kind, scope_id):
        self.events.append("users_in_scope")
        return ()

    async def over_budget_projects(self):
        self.events.append("over_budget_projects")
        return []

    async def maintenance(self, start_30, end_30):
        self.events.append("maintenance")
        return []

    async def approval_reminders(self, end_1):
        self.events.append("approval_reminders")
        return [
            {
                "id": "approval-step-1",
                "approverId": "user-1",
                "dueDate": datetime(2026, 10, 25),
                "requestId": "approval-1",
                "requestTitle": "Согласовать запрос",
            }
        ]

    async def mark_approval_reminder_sent(self, step_id):
        self.events.append(f"marked:{step_id}")


class FakeNotifications:
    async def deliveries(self, user_ids, event_type):
        return NotificationDeliveryPlan(
            active_user_ids=user_ids,
            deliveries=tuple((user_id, "IN_APP") for user_id in user_ids),
        )

    async def enqueue(self, intent):
        return NotificationProduceResult(created=1, email_queued=0)


class FakeAudit:
    async def append(self, record):
        return None


class FakeUow:
    def __init__(self, events):
        self.notifications = FakeNotifications()
        self.audit = FakeAudit()
        self.events = events

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def commit(self):
        self.events.append("committed")


@pytest.mark.anyio
async def test_alert_generation_uses_query_port_and_marks_reminder_after_commit() -> None:
    queries = FakeQueries()
    events: list[str] = []
    queries.events = events

    result = await collect_scheduled_alerts(
        lambda: FakeUow(events),
        queries,
        datetime(2026, 10, 25, 12),
        RequestContext(request_id="scheduled-alert-unit-test"),
    )

    assert isinstance(result, AlertResult)
    assert result.generated == 1
    assert result.email_queued == 0
    assert result.sources == {
        "contracts": 0,
        "tasks": 0,
        "assets": 0,
        "budgets": 0,
        "maintenance": 0,
        "approval-reminders": 1,
    }
    assert events == [
        "contracts",
        "overdue_tasks",
        "assets_for_disposal",
        "over_budget_projects",
        "maintenance",
        "approval_reminders",
        "committed",
        "marked:approval-step-1",
    ]


@pytest.mark.anyio
async def test_scheduled_runner_uses_lock_port_and_records_result() -> None:
    events: list[str] = []

    class RunLock:
        @asynccontextmanager
        async def hold(self):
            events.append("lock")
            try:
                yield object()
            finally:
                events.append("unlock")

        async def state(self, connection):
            events.append("state")
            return None, None

        async def started(self, connection, now):
            events.append("started")

        async def succeeded(self, connection, now):
            events.append("succeeded")

        async def failed(self, connection, now, error):
            events.append("failed")

    async def generate(now, request):
        events.append("generated")
        return AlertResult(ran=True, generated=2, email_queued=1, sources={"tasks": 2})

    context = ScheduledAlertContext(
        request=RequestContext(request_id="scheduled-runner-unit-test"),
        run_lock=RunLock(),
        queries=FakeQueries(),
        uow_factory=lambda: pytest.fail("Injected generator should not use the UoW"),
        generator=generate,
    )

    result = await run_scheduled_alerts(context, force=True, now=datetime(2026, 10, 25))

    assert result == AlertResult(ran=True, generated=2, email_queued=1, sources={"tasks": 2})
    assert events == ["lock", "state", "started", "generated", "succeeded", "unlock"]
