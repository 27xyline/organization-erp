import asyncio
import json
from datetime import UTC, date, datetime
from decimal import Decimal
from types import SimpleNamespace

from app.api.routes.timekeeping import create_entry
from app.core.context import RequestContext
from app.schemas.timekeeping import TimeEntryInput
from app.services.timekeeping import _entry_values


def test_create_entry_response_matches_legacy_json_scalar_shapes() -> None:
    employee_id = "c" + "1" * 24
    employee = SimpleNamespace(
        id=employee_id,
        code="S10-001",
        fullName="Тестовый сотрудник",
        department="Тестовый отдел",
        employmentRate=Decimal("0.75"),
        staffSchedule=SimpleNamespace(position="Инженер", salary=Decimal("80000.00")),
    )
    row = SimpleNamespace(
        id="s10-entry",
        employeeId=employee.id,
        projectId=None,
        taskId=None,
        workDate=date(2026, 10, 22),
        type="REGULAR",
        hours=Decimal("7.50"),
        note=None,
        createdAt=datetime(2026, 10, 22, 9, 0, tzinfo=UTC),
        updatedAt=datetime(2026, 10, 22, 9, 0, tzinfo=UTC),
        employee=employee,
        project=None,
        task=None,
    )

    class Service:
        async def create(self, value: TimeEntryInput, context: RequestContext):
            return _entry_values(row)

    response = asyncio.run(
        create_entry(
            TimeEntryInput.model_validate(
                {
                    "employeeId": employee.id,
                    "workDate": "2026-10-22",
                    "type": "REGULAR",
                    "hours": 7.5,
                }
            ),
            RequestContext(request_id="s10-request"),
            Service(),  # type: ignore[arg-type]
        )
    )
    value = json.loads(response.body)["data"]

    assert value["workDate"] == "2026-10-22T00:00:00.000Z"
    assert value["hours"] == 7.5
    assert value["employee"]["employmentRate"] == 0.75
    assert value["employee"]["staffSchedule"]["salary"] == 80000
