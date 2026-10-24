from __future__ import annotations

import asyncio
from datetime import date
from decimal import Decimal
from typing import Any

from app.core.context import RequestContext
from app.domain.errors import DomainError
from app.domain.finance.payroll_calculator import calculate_payroll
from app.domain.ports.audit import AuditRecord
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.integrations.payroll_export import build_payroll_workbook, build_payslip_workbook
from app.models.enums import PayrollAdjustmentType
from app.services.users import authorize


def _employee_in_scope(access: Any, employee: Any) -> bool:
    for grant in access.grants_for("finance.salary.read"):
        if grant.department_scope_mode == "ALL":
            return True
        if grant.department_scope_mode == "SELF" and employee.id == access.employee_id:
            return True
        if (
            grant.department_scope_mode == "ASSIGNED"
            and employee.departmentId in grant.department_ids
        ):
            return True
    return False


def _number(value: Decimal | int | float | None) -> float:
    return float(value or 0)


def _actor(context: RequestContext, permission: str) -> Any:
    actor = context.actor
    if actor is None:
        raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)
    authorize(actor, permission)
    return actor


class PayrollService:
    def __init__(self, factory: UnitOfWorkFactory[UnitOfWork]) -> None:
        self._factory = factory

    async def get_month(
        self,
        year: int,
        month: int,
        context: RequestContext,
        *,
        permission: str = "payroll.read",
    ) -> dict[str, Any]:
        actor = _actor(context, permission)
        assert actor.access is not None
        async with self._factory() as uow:
            await uow.payroll_input_lock.lock_shared()
            employees = [
                employee
                for employee in await uow.finance.employees()
                if _employee_in_scope(actor.access, employee)
            ]
            employee_ids = tuple(employee.id for employee in employees)
            project_rows = await uow.finance.projects_for_plan()
            projects = sorted(project_rows, key=lambda project: project.name)
            salary_entries = await uow.finance.salary_entries(year, month, employee_ids)
            plans = [
                entry
                for entry in await uow.finance.plan_entries(year, employee_ids=employee_ids)
                if entry.month == month
            ]
            adjustments = await uow.finance.payroll_adjustments(
                year, month, employee_ids=employee_ids
            )
            project_plans = [
                entry
                for entry in await uow.finance.plan_entries(year, project_only=True)
                if entry.month == month
            ]
            project_adjustments = await uow.finance.payroll_adjustments(year, month)
            period = await uow.finance.payroll_period(year, month)

            salary_by_employee = {entry.employeeId: entry for entry in salary_entries}
            plans_by_employee: dict[str, list[Any]] = {}
            adjustments_by_employee: dict[str, list[Any]] = {}
            for entry in plans:
                plans_by_employee.setdefault(entry.employeeId, []).append(entry)
            for adjustment in adjustments:
                adjustments_by_employee.setdefault(adjustment.employeeId, []).append(adjustment)

            rows = []
            for employee in employees:
                employee_plans = plans_by_employee.get(employee.id, [])
                employee_adjustments = adjustments_by_employee.get(employee.id, [])
                planned_base = (
                    employee.staffSchedule.salary if employee.staffSchedule else Decimal("0")
                ) * employee.employmentRate
                planned_oklad = sum(
                    (entry.amount for entry in employee_plans if str(entry.type) == "OKLAD"),
                    Decimal("0"),
                )
                allowance_value = sum(
                    (entry.amount for entry in employee_plans if str(entry.type) == "NADBAVKA"),
                    Decimal("0"),
                )
                amounts = {
                    kind: sum(
                        (entry.amount for entry in employee_adjustments if str(entry.type) == kind),
                        Decimal("0"),
                    )
                    for kind in ("BONUS", "ONE_TIME", "DEDUCTION")
                }
                salary_entry = salary_by_employee.get(employee.id)
                actual_base = (
                    salary_entry.amount
                    if salary_entry and salary_entry.amount
                    else planned_oklad or planned_base
                )
                calculated = calculate_payroll(
                    planned_base=planned_base,
                    planned_allowance=allowance_value,
                    actual_base=actual_base,
                    allowance=allowance_value,
                    bonus=amounts["BONUS"],
                    one_time=amounts["ONE_TIME"],
                    deduction=amounts["DEDUCTION"],
                )
                row = {
                    "employeeId": employee.id,
                    "code": employee.code,
                    "fullName": employee.fullName,
                    "department": employee.department,
                    "position": employee.staffSchedule.position
                    if employee.staffSchedule and employee.staffSchedule.position
                    else "—",
                    "rate": _number(employee.employmentRate),
                    "plannedBase": _number(planned_base),
                    "actualBase": _number(actual_base),
                    "allowance": _number(allowance_value),
                    "bonus": _number(amounts["BONUS"]),
                    "oneTime": _number(amounts["ONE_TIME"]),
                    "deduction": _number(amounts["DEDUCTION"]),
                    "plannedGross": _number(calculated.planned_gross),
                    "gross": _number(calculated.gross),
                    "tax": _number(calculated.tax),
                    "contributions": _number(calculated.contributions),
                    "payable": _number(calculated.payable),
                    "employerCost": _number(calculated.employer_cost),
                    "variance": _number(calculated.variance),
                    "adjustments": [
                        {
                            "id": entry.id,
                            "type": str(entry.type),
                            "amount": _number(entry.amount),
                            "description": entry.description,
                            "project": (
                                {
                                    "id": entry.project.id,
                                    "code": entry.project.code,
                                    "name": entry.project.name,
                                }
                                if entry.project
                                else None
                            ),
                            "createdAt": entry.createdAt,
                        }
                        for entry in employee_adjustments
                    ],
                }
                rows.append(row)

            department_totals: dict[str, dict[str, Any]] = {}
            totals = {
                key: 0.0
                for key in ("planned", "gross", "tax", "contributions", "payable", "employerCost")
            }
            for row in rows:
                dept = department_totals.setdefault(
                    row["department"],
                    {
                        "department": row["department"],
                        "planned": 0.0,
                        "gross": 0.0,
                        "payable": 0.0,
                        "employerCost": 0.0,
                    },
                )
                for key, field in (
                    ("planned", "plannedGross"),
                    ("gross", "gross"),
                    ("payable", "payable"),
                    ("employerCost", "employerCost"),
                ):
                    dept[key] += row[field]
                for key in totals:
                    field = "plannedGross" if key == "planned" else key
                    totals[key] += row[field]

            selected = date(year, month, 1)
            project_forecasts = []
            for project in projects:
                monthly_payroll = sum(
                    (
                        _number(entry.amount)
                        for entry in project_plans
                        if entry.projectId == project.id
                    ),
                    0.0,
                )
                for adjustment in project_adjustments:
                    if adjustment.projectId == project.id:
                        sign = -1 if str(adjustment.type) == "DEDUCTION" else 1
                        monthly_payroll += sign * _number(adjustment.amount)
                remaining = 0
                if project.endDate:
                    remaining = max(
                        0,
                        (project.endDate.year - selected.year) * 12
                        + project.endDate.month
                        - selected.month
                        + 1,
                    )
                forecast = _number(project.actualBudget) + monthly_payroll * remaining
                project_forecasts.append(
                    {
                        "id": project.id,
                        "code": project.code,
                        "name": project.name,
                        "plannedBudget": _number(project.plannedBudget),
                        "actualBudget": _number(project.actualBudget),
                        "monthlyPayroll": monthly_payroll,
                        "forecast": forecast,
                        "variance": forecast - _number(project.plannedBudget),
                    }
                )

            period_value = (
                {
                    "id": period.id,
                    "year": period.year,
                    "month": period.month,
                    "status": str(period.status),
                    "closedAt": period.closedAt,
                    "closedById": period.closedById,
                    "createdAt": period.createdAt,
                    "updatedAt": period.updatedAt,
                    "closedBy": (
                        {
                            "id": period.closedBy.id,
                            "name": period.closedBy.name,
                            "username": period.closedBy.username,
                        }
                        if period.closedBy
                        else None
                    ),
                }
                if period
                else {
                    "year": year,
                    "month": month,
                    "status": "OPEN",
                    "closedAt": None,
                    "closedBy": None,
                }
            )
            return {
                "period": period_value,
                "rows": rows,
                "departmentTotals": list(department_totals.values()),
                "projectForecasts": project_forecasts,
                "totals": totals,
                "options": {
                    "employees": [
                        {"id": e.id, "code": e.code, "fullName": e.fullName} for e in employees
                    ],
                    "projects": [{"id": p.id, "code": p.code, "name": p.name} for p in projects],
                },
            }

    async def export_month(
        self, year: int, month: int, context: RequestContext
    ) -> tuple[bytes, str]:
        report = await self.get_month(year, month, context, permission="payroll.export")
        content = await asyncio.to_thread(build_payroll_workbook, year, month, report["rows"])
        return content, f"payroll-{year}-{month:02d}.xlsx"

    async def export_payslip(
        self, year: int, month: int, employee_id: str, context: RequestContext
    ) -> tuple[bytes, str]:
        report = await self.get_month(year, month, context, permission="payroll.export")
        row = next((entry for entry in report["rows"] if entry["employeeId"] == employee_id), None)
        if row is None:
            raise DomainError(
                "NOT_FOUND", "Сотрудник не найден в расчетной ведомости за этот месяц", 404
            )
        content = await asyncio.to_thread(build_payslip_workbook, year, month, row)
        return content, f"payslip-{row['code']}-{year}-{month:02d}.xlsx"

    async def create_adjustment(
        self, values: dict[str, Any], context: RequestContext
    ) -> dict[str, Any]:
        actor = _actor(context, "payroll.manage")
        assert actor.actor_id is not None
        async with self._factory() as uow:
            await uow.payroll_periods.assert_open(values["year"], values["month"])
            adjustment = await uow.finance.create_payroll_adjustment(
                {
                    **values,
                    "type": PayrollAdjustmentType(values["type"]),
                    "description": values["description"].strip(),
                }
            )
            await uow.audit.append(
                AuditRecord(
                    "PAYROLL_ADJUSTMENT_CREATE",
                    "PayrollAdjustment",
                    adjustment.id,
                    actor.actor_id,
                    {
                        "employeeId": adjustment.employeeId,
                        "year": adjustment.year,
                        "month": adjustment.month,
                        "type": str(adjustment.type),
                        "amount": _number(adjustment.amount),
                    },
                    context.request_id,
                )
            )
            await uow.commit()
            return self._adjustment_payload(adjustment)

    async def remove_adjustment(self, identifier: str, context: RequestContext) -> None:
        actor = _actor(context, "payroll.manage")
        assert actor.actor_id is not None
        async with self._factory() as uow:
            adjustment = await uow.finance.payroll_adjustment(identifier)
            if adjustment is None:
                raise DomainError("ADJUSTMENT_NOT_FOUND", "Корректировка не найдена", 404)
            await uow.payroll_periods.assert_open(adjustment.year, adjustment.month)
            adjustment = await uow.finance.payroll_adjustment(identifier)
            if adjustment is None:
                raise DomainError("ADJUSTMENT_NOT_FOUND", "Корректировка не найдена", 404)
            await uow.finance.delete_payroll_adjustment(adjustment)
            await uow.audit.append(
                AuditRecord(
                    "PAYROLL_ADJUSTMENT_DELETE",
                    "PayrollAdjustment",
                    identifier,
                    actor.actor_id,
                    {
                        "employeeId": adjustment.employeeId,
                        "year": adjustment.year,
                        "month": adjustment.month,
                    },
                    context.request_id,
                )
            )
            await uow.commit()

    @staticmethod
    def _adjustment_payload(adjustment: Any) -> dict[str, Any]:
        return {
            "id": adjustment.id,
            "employeeId": adjustment.employeeId,
            "projectId": adjustment.projectId,
            "year": adjustment.year,
            "month": adjustment.month,
            "type": str(adjustment.type),
            "amount": _number(adjustment.amount),
            "description": adjustment.description,
            "createdAt": adjustment.createdAt,
            "updatedAt": adjustment.updatedAt,
        }
