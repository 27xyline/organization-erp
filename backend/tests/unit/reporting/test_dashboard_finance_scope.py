from datetime import date, datetime
from decimal import Decimal
from typing import Any

import pytest

from app.domain.auth.rules import AccessContext, ScopeGrant
from app.models.timekeeping import StaffSchedule
from app.repositories.reporting import _dashboard_employee_columns
from app.services.dashboard import DashboardService
from app.services.dto.reporting import DashboardQuery


class _DashboardRepository:
    async def dashboard(
        self, query: dict[str, str | None], access: AccessContext, now: datetime
    ) -> dict[str, Any]:
        return {
            "today": datetime(2026, 6, 1),
            "todayEnd": datetime(2026, 6, 1, 23, 59, 59),
            "horizon": datetime(2026, 8, 30),
            "departments": [],
            "projectOptions": [],
            "employees": [
                {
                    "id": "employee-1",
                    "code": "EMP-1",
                    "fullName": "Иван Иванов",
                    "departmentId": "department-1",
                    "department": "Закрытый отдел",
                    "status": "ACTIVE",
                    "employmentRate": Decimal("1"),
                    "contractEndDate": None,
                    "position": "Разработчик",
                    # A malicious/buggy adapter must not bypass service-level authorization.
                    "salary": Decimal("987654321.25"),
                }
            ],
            "staff": [("department-1", Decimal("1"))],
            "salaries": [("department-1", Decimal("987654321.25"))],
            "projects": [],
            "assets": [],
            "vacations": [],
            "tasks": [],
            "operations": [],
            "actions": [],
            "audits": [],
            "visibility": {
                "employees": True,
                "projects": False,
                "finance": True,
                "assets": False,
                "audit": False,
            },
        }


def test_employee_projection_selects_schedule_salary_only_for_finance_readers() -> None:
    visible_columns = _dashboard_employee_columns(can_finance=False)
    finance_columns = _dashboard_employee_columns(can_finance=True)

    assert StaffSchedule.salary not in visible_columns
    assert StaffSchedule.salary in finance_columns


@pytest.mark.anyio
async def test_employee_reader_without_finance_permission_gets_no_compensation_fields() -> None:
    access = AccessContext(
        "hr-user",
        None,
        None,
        (),
        (ScopeGrant("hr-assignment", "HR", "ASSIGNED", "NONE", ("department-1",)),),
    )

    result = await DashboardService(_DashboardRepository()).get_overview(
        DashboardQuery(date(2026, 1, 1), date(2026, 12, 31)), access, now=datetime(2026, 6, 1)
    )

    assert result["visibility"]["employees"] is True
    assert result["visibility"]["finance"] is False
    assert "plannedFot" not in result["summary"]
    assert "actualFot" not in result["summary"]
    row = result["analytics"]["workforceByDepartment"][0]
    assert "plannedFot" not in row
    assert "actualFot" not in row
    assert "salary" not in row
    assert "987654321.25" not in repr(result)
