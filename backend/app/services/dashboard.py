from __future__ import annotations

from datetime import UTC, datetime, time, timedelta
from decimal import Decimal
from typing import Any

from app.domain.auth.rules import AccessContext
from app.domain.errors import DomainError
from app.domain.ports.reporting import ReportingRepository
from app.domain.reporting.aggregators import (
    SalaryInput,
    StaffCapacityInput,
    WorkforceInput,
    aggregate_assets,
    aggregate_projects,
    aggregate_vacations,
    aggregate_workforce,
    months_in_period,
)
from app.services.dto.reporting import DashboardQuery

DAY = timedelta(days=1)


class DashboardService:
    def __init__(self, repository: ReportingRepository) -> None:
        self.repository = repository

    async def get_overview(
        self, query: DashboardQuery, access: AccessContext, now: datetime | None = None
    ) -> dict[str, Any]:
        if not any(
            access.has(permission)
            for permission in ("dashboard.read", "reports.read", "reports.export")
        ):
            raise DomainError("FORBIDDEN", "Недостаточно прав", 403)
        if query.date_from > query.date_to:
            raise DomainError("VALIDATION_ERROR", "Проверьте период отчёта", 422)
        current = now or datetime.now(UTC).replace(tzinfo=None)
        raw = await self.repository.dashboard(query.as_dict(), access, current)
        today = raw["today"]
        today_end = raw["todayEnd"]
        horizon = raw["horizon"]
        date_from = datetime.combine(query.date_from, time.min)
        date_to = datetime.combine(query.date_to, time.max)

        workforce_input = [
            WorkforceInput(
                department_id=item["departmentId"],
                department=item["department"],
                active=item["status"] == "ACTIVE",
                employment_rate=Decimal(item["employmentRate"]),
                monthly_salary=Decimal(item["salary"]) * Decimal(item["employmentRate"]),
            )
            for item in raw["employees"]
        ]
        staff_input = [
            StaffCapacityInput(department_id=department_id, rate=rate)
            for department_id, rate in raw["staff"]
        ]
        salary_input = [
            SalaryInput(department_id=department_id, amount=amount)
            for department_id, amount in raw["salaries"]
        ]
        workforce, workforce_totals = aggregate_workforce(
            workforce_input, staff_input, salary_input, months_in_period(date_from, date_to)
        )
        workforce_rows = [
            {
                "departmentId": row.department_id,
                "department": row.department,
                "headcount": row.headcount,
                "active": row.active,
                "occupiedRate": float(row.occupied_rate),
                "staffRate": float(row.staff_rate),
                "plannedFot": float(row.planned_fot),
                "actualFot": float(row.actual_fot),
                "occupancy": round(float(row.occupied_rate / row.staff_rate) * 1000) / 10
                if row.staff_rate
                else 0,
            }
            for row in workforce
        ]
        project_summary = aggregate_projects(raw["projects"])
        asset_summary = aggregate_assets(raw["assets"])
        vacations = [
            item
            for item in raw["vacations"]
            if item["startDate"] <= date_to and item["endDate"] >= date_from
        ]
        absences = [
            item
            for item in raw["vacations"]
            if item["startDate"] <= today_end and item["endDate"] >= today
        ]

        contracts = []
        if raw["visibility"]["employees"]:
            for employee in raw["employees"]:
                contract_end = employee["contractEndDate"]
                if contract_end and today <= contract_end <= horizon:
                    contracts.append(
                        {
                            "id": employee["id"],
                            "code": employee["code"],
                            "employee": employee["fullName"],
                            "department": employee["department"],
                            "position": employee["position"],
                            "contractEndDate": contract_end,
                            "daysLeft": max(0, (contract_end.date() - today.date()).days),
                        }
                    )
        contracts.sort(key=lambda item: item["contractEndDate"])

        overdue_tasks = [
            {
                **task,
                "responsible": ", ".join(task["assignees"]) or "Не назначен",
                "overdueDays": max(1, (today.date() - task["endDate"].date()).days),
            }
            for task in raw["tasks"]
            if task["endDate"]
            and task["endDate"] < today
            and task["status"] != "COMPLETED"
            and task["progress"] < 100
        ]
        overdue_tasks.sort(key=lambda item: -item["overdueDays"])

        asset_attention = [
            asset
            for asset in raw["assets"]
            if asset["status"] in ("UNDER_REPAIR", "PLANNED_FOR_DISPOSAL")
            or (asset["plannedDisposalDate"] and asset["plannedDisposalDate"] <= horizon)
        ]
        recent_activity = [
            *[
                {
                    "id": f"asset-{item['id']}",
                    "kind": "ASSET",
                    "title": item["asset"]["name"],
                    "description": item["type"],
                    "date": item["date"],
                    "href": f"/assets/{item['asset']['id']}",
                }
                for item in raw["operations"]
            ],
            *[
                {
                    "id": f"employee-{item['id']}",
                    "kind": "EMPLOYEE",
                    "title": item["employee"]["fullName"],
                    "description": item["type"],
                    "date": item["date"],
                    "href": f"/employees/{item['employee']['id']}",
                }
                for item in raw["actions"]
            ],
            *[
                {
                    "id": f"audit-{item['id']}",
                    "kind": "AUDIT",
                    "title": item["name"] or "Система",
                    "description": f"{item['action']} · {item['entityType']}",
                    "date": item["createdAt"],
                    "href": None,
                }
                for item in raw["audits"]
            ],
        ]
        recent_activity.sort(key=lambda item: item["date"], reverse=True)
        recent_activity = recent_activity[:12]

        return {
            "query": query.as_dict(),
            "options": {"departments": raw["departments"], "projects": raw["projectOptions"]},
            "visibility": raw["visibility"],
            "summary": {
                "headcount": workforce_totals["headcount"],
                "active": workforce_totals["active"],
                "occupiedRate": float(workforce_totals["occupied_rate"]),
                "staffRate": float(workforce_totals["staff_rate"]),
                "plannedFot": float(workforce_totals["planned_fot"]),
                "actualFot": float(workforce_totals["actual_fot"]),
                "occupancy": round(
                    float(workforce_totals["occupied_rate"])
                    / float(workforce_totals["staff_rate"])
                    * 1000
                )
                / 10
                if workforce_totals["staff_rate"]
                else 0,
                **project_summary,
                "assetCount": asset_summary["count"],
                "assetValue": asset_summary["value"],
                "awayNow": len(absences),
                "overdueTasks": len(overdue_tasks),
                "assetAttention": len(asset_attention),
                "contractsExpiring": len(contracts),
            },
            "activeProjects": raw["projects"],
            "currentAbsences": absences,
            "contracts": contracts,
            "overdueTasks": overdue_tasks,
            "assetAttention": asset_attention,
            "recentActivity": recent_activity,
            "analytics": {
                "workforceByDepartment": workforce_rows,
                "projects": raw["projects"],
                "assetsByStatus": asset_summary["byStatus"],
                "vacationsByType": aggregate_vacations([item["type"] for item in vacations]),
                "vacations": vacations,
            },
        }
