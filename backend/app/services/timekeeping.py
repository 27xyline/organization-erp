from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any, NoReturn

from app.core.context import RequestContext
from app.domain.auth.rules import AccessContext
from app.domain.enums import TimeEntryType, TimesheetStatus
from app.domain.errors import DomainError
from app.domain.ports.audit import AuditRecord
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.domain.timekeeping.labor_calculator import calculate_labor_amounts, standard_monthly_hours
from app.domain.timekeeping.rules import payroll_period_keys, validate_daily_hours
from app.services.approvals import create_approval_in_uow, decide_approval_in_uow
from app.services.dto.approvals import (
    ApprovalCommand,
    ApprovalDecisionCommand,
    ApprovalStepCommand,
)
from app.services.dto.timekeeping import (
    SubmitTimesheetCommand,
    TimeEntryCommand,
    TimeEntryUpdateCommand,
    TimesheetDecisionCommand,
)
from app.services.employees import authorize


def _fail(code: str, message: str, status: int = 409) -> NoReturn:
    raise DomainError(code, message, status)


def _entry_values(row: Any) -> dict[str, Any]:
    def related(value: Any, fields: tuple[str, ...]) -> dict[str, Any] | None:
        if value is None:
            return None
        return {field: _legacy_number(getattr(value, field)) for field in fields}

    def _legacy_number(value: Any) -> Any:
        return float(value) if isinstance(value, Decimal) else value

    employee = row.employee
    schedule = employee.staffSchedule
    return {
        "id": row.id,
        "employeeId": row.employeeId,
        "projectId": row.projectId,
        "taskId": row.taskId,
        "workDate": datetime.combine(row.workDate, datetime.min.time(), UTC)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z"),
        "type": str(row.type),
        "hours": _legacy_number(row.hours),
        "note": row.note,
        "createdAt": row.createdAt,
        "updatedAt": row.updatedAt,
        "employee": {
            "id": employee.id,
            "code": employee.code,
            "fullName": employee.fullName,
            "department": employee.department,
            "employmentRate": _legacy_number(employee.employmentRate),
            "staffSchedule": related(schedule, ("position", "salary")),
        },
        "project": related(row.project, ("id", "code", "name")),
        "task": related(row.task, ("id", "name")),
    }


class TimekeepingService:
    def __init__(self, factory: UnitOfWorkFactory[UnitOfWork]) -> None:
        self._factory = factory

    async def month(
        self,
        year: int,
        month: int,
        context: RequestContext,
        employee_id: str | None = None,
        project_id: str | None = None,
    ) -> dict[str, Any]:
        actor = context.actor
        assert actor is not None and actor.access is not None
        authorize(actor, "timekeeping.read")
        async with self._factory() as uow:
            await uow.payroll_input_lock.lock_shared()
            rows = await uow.timekeeping.month_entries(year, month)
            can_read_all = any(
                role in {"ADMIN", "HR", "ACCOUNTANT", "AUDITOR"} for role in actor.access.roles
            )
            visible = [
                row
                for row in rows
                if can_read_all
                or row.employeeId == actor.employee_id
                or actor.access.allows(
                    "employees.read",
                    {"employeeId": row.employeeId, "departmentId": row.employee.departmentId},
                )
                or (
                    row.projectId
                    and actor.access.allows("projects.read", {"projectId": row.projectId})
                )
                if employee_id is None or row.employeeId == employee_id
            ]
            if project_id:
                visible = [row for row in visible if row.projectId == project_id]
            summaries: dict[str, dict[str, Any]] = {}
            for entry in visible:
                employee = entry.employee
                row = summaries.setdefault(
                    entry.employeeId,
                    {
                        "employeeId": entry.employeeId,
                        "employeeName": employee.fullName,
                        "department": employee.department,
                        "rate": float(employee.employmentRate),
                        "baseSalary": float(
                            (employee.staffSchedule.salary if employee.staffSchedule else 0)
                            * employee.employmentRate
                        ),
                        "regularHours": 0.0,
                        "vacationHours": 0.0,
                        "sickHours": 0.0,
                        "tripHours": 0.0,
                        "overtimeHours": 0.0,
                        "calculatedSalary": 0.0,
                        "projectCost": 0.0,
                        "projectHours": 0.0,
                        "projectOvertimeHours": 0.0,
                    },
                )
                hours = float(entry.hours)
                label = {
                    "REGULAR": "regularHours",
                    "VACATION": "vacationHours",
                    "SICK_LEAVE": "sickHours",
                    "BUSINESS_TRIP": "tripHours",
                    "OVERTIME": "overtimeHours",
                }[str(entry.type)]
                row[label] += hours
                if entry.projectId and str(entry.type) in {"REGULAR", "BUSINESS_TRIP", "OVERTIME"}:
                    row[
                        "projectOvertimeHours" if str(entry.type) == "OVERTIME" else "projectHours"
                    ] += hours
            normative_hours = standard_monthly_hours(year, month)
            for row in summaries.values():
                amounts = calculate_labor_amounts(
                    base_salary=Decimal(str(row["baseSalary"])),
                    normative_hours=Decimal(normative_hours),
                    paid_hours=Decimal(
                        str(
                            row["regularHours"]
                            + row["vacationHours"]
                            + row["sickHours"]
                            + row["tripHours"]
                        )
                    ),
                    overtime_hours=Decimal(str(row["overtimeHours"])),
                    project_hours=Decimal(str(row["projectHours"])),
                    project_overtime_hours=Decimal(str(row["projectOvertimeHours"])),
                )
                row["calculatedSalary"] = float(amounts.calculated_salary)
                row["projectCost"] = float(amounts.project_cost)
            employees = [
                item
                for item in await uow.timekeeping.employee_options()
                if can_read_all
                or item.id == actor.employee_id
                or actor.access.allows(
                    "employees.read", {"employeeId": item.id, "departmentId": item.departmentId}
                )
                or actor.access.allows(
                    "timekeeping.timesheets.review", {"departmentId": item.departmentId}
                )
                or any(row.employeeId == item.id for row in visible)
            ]
            projects = [
                item
                for item in await uow.timekeeping.project_options()
                if can_read_all or actor.access.allows("projects.read", {"projectId": item["id"]})
            ]
            sheets = [
                item
                for item in await uow.timekeeping.month_timesheets(year, month)
                if can_read_all
                or item.employeeId == actor.employee_id
                or actor.access.allows(
                    "timekeeping.timesheets.read", {"employeeId": item.employeeId}
                )
                or actor.access.allows(
                    "timekeeping.timesheets.review", {"departmentId": item.employee.departmentId}
                )
            ]
            sheet_employee_rows = [
                item
                for item in employees
                if can_read_all
                or item.id == actor.employee_id
                or actor.access.allows("timekeeping.timesheets.read", {"employeeId": item.id})
                or actor.access.allows(
                    "timekeeping.timesheets.review", {"departmentId": item.departmentId}
                )
            ]
            existing_sheet_employee_ids = {item.employeeId for item in sheets}
            virtual_drafts = [
                {
                    "id": f"draft:{employee.id}:{year}:{month}",
                    "employeeId": employee.id,
                    "year": year,
                    "month": month,
                    "status": "DRAFT",
                    "zeroHoursConfirmed": False,
                    "submittedById": None,
                    "submittedBy": None,
                    "submittedAt": None,
                    "decidedById": None,
                    "decidedBy": None,
                    "decidedAt": None,
                    "decisionReason": None,
                    "employee": {
                        "id": employee.id,
                        "fullName": employee.fullName,
                        "code": employee.code,
                        "department": employee.department,
                        "departmentId": employee.departmentId,
                    },
                }
                for employee in sheet_employee_rows
                if employee.id not in existing_sheet_employee_ids
            ]
            period_status = await uow.payroll_periods.get_status(year, month) or "OPEN"
            return {
                "year": year,
                "month": month,
                "normativeHours": normative_hours,
                "entries": [_entry_values(row) for row in visible],
                "timesheets": [
                    {
                        "id": item.id,
                        "employeeId": item.employeeId,
                        "year": item.year,
                        "month": item.month,
                        "status": str(item.status),
                        "zeroHoursConfirmed": item.zeroHoursConfirmed,
                        "submittedById": item.submittedById,
                        "submittedBy": {"id": item.submittedBy.id, "name": item.submittedBy.name}
                        if item.submittedBy
                        else None,
                        "submittedAt": item.submittedAt,
                        "decidedById": item.decidedById,
                        "decidedBy": {"id": item.decidedBy.id, "name": item.decidedBy.name}
                        if item.decidedBy
                        else None,
                        "decidedAt": item.decidedAt,
                        "decisionReason": item.decisionReason,
                        "employee": {
                            "id": item.employee.id,
                            "fullName": item.employee.fullName,
                            "code": item.employee.code,
                            "department": item.employee.department,
                            "departmentId": item.employee.departmentId,
                        },
                    }
                    for item in sheets
                ]
                + virtual_drafts,
                "period": {"status": period_status},
                "summaries": sorted(summaries.values(), key=lambda item: item["employeeName"]),
                "employees": [
                    {
                        "id": item.id,
                        "code": item.code,
                        "fullName": item.fullName,
                        "department": item.department,
                    }
                    for item in employees
                ],
                "projects": [item for item in projects],
            }

    @staticmethod
    def _can_mutate(access: AccessContext, employee_id: str, project_id: str | None) -> bool:
        if any(role in {"ADMIN", "HR"} for role in access.roles):
            return True
        if employee_id == access.employee_id:
            return True
        return bool(project_id and access.allows("projects.update", {"projectId": project_id}))

    async def _writable(
        self,
        uow: UnitOfWork,
        employee_id: str,
        work_date: date,
        access: AccessContext,
        reason: str | None = None,
    ) -> bool:
        status = await uow.payroll_periods.lock_period(work_date.year, work_date.month)
        if status == "CLOSED":
            _fail("PERIOD_CLOSED", "Расчётный период закрыт")
        timesheet = await uow.timekeeping.timesheet(employee_id, work_date.year, work_date.month)
        current = str(timesheet.status) if timesheet else "DRAFT"
        if current == "SUBMITTED":
            _fail("TIMESHEET_LOCKED", "Табель отправлен на согласование")
        if current == "APPROVED":
            if not access.has("timekeeping.timesheets.correct"):
                _fail("TIMESHEET_LOCKED", "Утверждённый табель заблокирован")
            if not (reason or "").strip():
                _fail("CORRECTION_REASON_REQUIRED", "Укажите причину корректировки", 422)
            return True
        return False

    async def _invalidate_corrected_timesheet(
        self, uow: UnitOfWork, employee_id: str, work_date: date, correcting: bool
    ) -> None:
        if not correcting:
            return
        sheet = await uow.timekeeping.timesheet(
            employee_id, work_date.year, work_date.month, for_update=True
        )
        if sheet is None or str(sheet.status) != "APPROVED":
            return
        await uow.timekeeping.save_timesheet(
            {
                "status": TimesheetStatus.DRAFT,
                "zeroHoursConfirmed": False,
                "submittedById": None,
                "submittedAt": None,
                "decidedById": None,
                "decidedAt": None,
                "decisionReason": None,
            },
            sheet.id,
        )

    async def create(self, value: TimeEntryCommand, context: RequestContext) -> dict[str, Any]:
        actor = context.actor
        assert actor is not None and actor.access is not None
        authorize(actor, "timekeeping.create")
        async with self._factory() as uow:
            correcting = await self._writable(
                uow, value.employeeId, value.workDate, actor.access, value.correctionReason
            )
            target_employee = await uow.timekeeping.employee(value.employeeId)
            project = await uow.timekeeping.project(value.projectId) if value.projectId else None
            task = await uow.timekeeping.task(value.taskId) if value.taskId else None
            if (
                not target_employee
                or (value.projectId and project is None)
                or (value.taskId and task is None)
            ):
                _fail("INVALID_REFERENCE", "Сотрудник, проект или задача не найдены", 422)
            if task is not None and (project is None or task.projectId != project.id):
                _fail("INVALID_REFERENCE", "Задача не относится к выбранному проекту", 422)
            if not self._can_mutate(actor.access, value.employeeId, value.projectId):
                _fail("FORBIDDEN", "Недостаточно прав", 403)
            existing = await uow.timekeeping.daily_hours(value.employeeId, value.workDate)
            if not validate_daily_hours(existing, value.hours):
                _fail("DAILY_HOURS_EXCEEDED", "Сумма часов за день не может превышать 24", 422)
            row = await uow.timekeeping.save_entry(
                {
                    "employeeId": value.employeeId,
                    "projectId": value.projectId,
                    "taskId": value.taskId,
                    "workDate": value.workDate,
                    "type": TimeEntryType(value.type),
                    "hours": value.hours,
                    "note": value.note or None,
                }
            )
            await self._invalidate_corrected_timesheet(
                uow, value.employeeId, value.workDate, correcting
            )
            await uow.audit.append(
                AuditRecord(
                    "TIME_ENTRY_CORRECTION" if correcting else "TIME_ENTRY_CREATE",
                    "TimeEntry",
                    row.id,
                    actor.actor_id,
                    {
                        "employeeId": value.employeeId,
                        "workDate": value.workDate.isoformat(),
                        "hours": str(value.hours),
                        **({"correctionReason": value.correctionReason} if correcting else {}),
                    },
                    context.request_id,
                )
            )
            await uow.commit()
            return _entry_values(row)

    async def update(
        self, identifier: str, value: TimeEntryUpdateCommand, context: RequestContext
    ) -> dict[str, Any]:
        actor = context.actor
        assert actor is not None and actor.access is not None
        authorize(actor, "timekeeping.update")
        changes = {key: item for key, item in value.values.items() if key != "correctionReason"}
        async with self._factory() as uow:
            await uow.payroll_input_lock.lock_shared()
            row = await uow.timekeeping.get_entry(identifier, for_update=True)
            if row is None:
                _fail("NOT_FOUND", "Запись рабочего времени не найдена", 404)
            employee_id = changes.get("employeeId", row.employeeId)
            project_id = changes.get("projectId", row.projectId)
            task_id = changes.get("taskId", row.taskId)
            work_date = changes.get("workDate", row.workDate)
            hours = Decimal(changes.get("hours", row.hours))
            statuses: dict[tuple[int, int], str] = {}
            for year, month in payroll_period_keys(row.workDate, work_date):
                statuses[(year, month)] = await uow.payroll_periods.lock_period(year, month)
            if any(status == "CLOSED" for status in statuses.values()):
                _fail("PERIOD_CLOSED", "Расчётный период закрыт")
            old_correction = await self._writable(
                uow, row.employeeId, row.workDate, actor.access, value.correctionReason
            )
            next_correction = await self._writable(
                uow, employee_id, work_date, actor.access, value.correctionReason
            )
            employee = await uow.timekeeping.employee(employee_id)
            project = await uow.timekeeping.project(project_id) if project_id else None
            task = await uow.timekeeping.task(task_id) if task_id else None
            if not employee or (project_id and project is None) or (task_id and task is None):
                _fail("INVALID_REFERENCE", "Сотрудник, проект или задача не найдены", 422)
            if task is not None and (project is None or task.projectId != project.id):
                _fail("INVALID_REFERENCE", "Задача не относится к выбранному проекту", 422)
            if not self._can_mutate(
                actor.access, row.employeeId, row.projectId
            ) or not self._can_mutate(actor.access, employee_id, project_id):
                _fail("FORBIDDEN", "Недостаточно прав", 403)
            existing = await uow.timekeeping.daily_hours(employee_id, work_date, identifier)
            if not validate_daily_hours(existing, hours):
                _fail("DAILY_HOURS_EXCEEDED", "Сумма часов за день не может превышать 24", 422)
            if "type" in changes:
                changes["type"] = TimeEntryType(changes["type"])
            if "note" in changes:
                changes["note"] = changes["note"] or None
            updated = await uow.timekeeping.save_entry(changes, identifier)
            correction_rows = {
                (row.employeeId, row.workDate): old_correction,
                (employee_id, work_date): next_correction,
            }
            for (corrected_employee_id, corrected_work_date), correcting in correction_rows.items():
                await self._invalidate_corrected_timesheet(
                    uow, corrected_employee_id, corrected_work_date, correcting
                )
            await uow.audit.append(
                AuditRecord(
                    "TIME_ENTRY_CORRECTION"
                    if old_correction or next_correction
                    else "TIME_ENTRY_UPDATE",
                    "TimeEntry",
                    identifier,
                    actor.actor_id,
                    {
                        "employeeId": employee_id,
                        "workDate": work_date.isoformat(),
                        "hours": str(hours),
                        **(
                            {"correctionReason": value.correctionReason}
                            if old_correction or next_correction
                            else {}
                        ),
                    },
                    context.request_id,
                )
            )
            await uow.commit()
            return _entry_values(updated)

    async def remove(
        self, identifier: str, context: RequestContext, correction_reason: str | None = None
    ) -> None:
        actor = context.actor
        assert actor is not None and actor.access is not None
        authorize(actor, "timekeeping.delete")
        async with self._factory() as uow:
            await uow.payroll_input_lock.lock_shared()
            row = await uow.timekeeping.get_entry(identifier, for_update=True)
            if row is None:
                _fail("NOT_FOUND", "Запись рабочего времени не найдена", 404)
            correcting = await self._writable(
                uow, row.employeeId, row.workDate, actor.access, correction_reason
            )
            if not self._can_mutate(actor.access, row.employeeId, row.projectId):
                _fail("FORBIDDEN", "Недостаточно прав", 403)
            await uow.timekeeping.delete_entry(identifier)
            await self._invalidate_corrected_timesheet(
                uow, row.employeeId, row.workDate, correcting
            )
            await uow.audit.append(
                AuditRecord(
                    "TIME_ENTRY_CORRECTION" if correcting else "TIME_ENTRY_DELETE",
                    "TimeEntry",
                    identifier,
                    actor.actor_id,
                    {
                        "employeeId": row.employeeId,
                        "workDate": row.workDate.isoformat(),
                        **({"correctionReason": correction_reason} if correcting else {}),
                    },
                    context.request_id,
                )
            )
            await uow.commit()

    async def submit(
        self, value: SubmitTimesheetCommand, context: RequestContext
    ) -> dict[str, Any]:
        actor = context.actor
        assert actor is not None and actor.access is not None
        authorize(actor, "timekeeping.timesheets.submit", {"employeeId": value.employeeId})
        if actor.employee_id != value.employeeId and not any(
            role in {"ADMIN", "HR"} for role in actor.access.roles
        ):
            _fail("FORBIDDEN", "Недостаточно прав", 403)
        async with self._factory() as uow:
            status = await uow.payroll_periods.lock_period(value.year, value.month)
            if status == "CLOSED":
                _fail("PERIOD_CLOSED", "Расчётный период закрыт")
            employee = await uow.timekeeping.employee(value.employeeId)
            if employee is None:
                _fail("NOT_FOUND", "Сотрудник не найден", 404)
            entries = await uow.timekeeping.month_entries(value.year, value.month)
            count = sum(entry.employeeId == value.employeeId for entry in entries)
            if not count and not value.zeroHoursConfirmed:
                _fail(
                    "ZERO_HOURS_CONFIRMATION_REQUIRED",
                    "Подтвердите отправку табеля с нулём часов",
                    422,
                )
            current = await uow.timekeeping.timesheet(
                value.employeeId, value.year, value.month, for_update=True
            )
            if current and str(current.status) in {"SUBMITTED", "APPROVED"}:
                _fail("TIMESHEET_STATE_INVALID", "Табель нельзя отправить в текущем состоянии")
            now = datetime.now(UTC).replace(tzinfo=None)
            sheet = await uow.timekeeping.save_timesheet(
                {
                    "employeeId": value.employeeId,
                    "year": value.year,
                    "month": value.month,
                    "status": TimesheetStatus.SUBMITTED,
                    "zeroHoursConfirmed": count == 0,
                    "submittedById": actor.actor_id,
                    "submittedAt": now,
                    "decidedById": None,
                    "decidedAt": None,
                    "decisionReason": None,
                },
                current.id if current else None,
            )
            reviewer = await uow.timekeeping.reviewer_for(value.employeeId)
            if reviewer is None:
                _fail("APPROVER_NOT_FOUND", "Не найден сотрудник для согласования табеля")
            await create_approval_in_uow(
                ApprovalCommand(
                    title=f"Табель за {value.month:02d}.{value.year}",
                    entityType="Timesheet",
                    entityId=sheet.id,
                    steps=(
                        ApprovalStepCommand(
                            approverId=reviewer["approverId"], name="Согласование табеля"
                        ),
                    ),
                ),
                context,
                uow,
            )
            await uow.audit.append(
                AuditRecord(
                    "TIMESHEET_SUBMIT",
                    "Timesheet",
                    sheet.id,
                    actor.actor_id,
                    {
                        "employeeId": value.employeeId,
                        "year": value.year,
                        "month": value.month,
                        "zeroHoursConfirmed": count == 0,
                    },
                    context.request_id,
                )
            )
            await uow.commit()
            return {
                "id": sheet.id,
                "employeeId": sheet.employeeId,
                "year": sheet.year,
                "month": sheet.month,
                "status": str(sheet.status),
                "zeroHoursConfirmed": sheet.zeroHoursConfirmed,
                "submittedById": sheet.submittedById,
                "submittedAt": sheet.submittedAt,
            }

    async def decide(
        self, identifier: str, value: TimesheetDecisionCommand, context: RequestContext
    ) -> dict[str, Any]:
        actor = context.actor
        assert actor is not None and actor.access is not None
        authorize(actor, "timekeeping.timesheets.review")
        async with self._factory() as uow:
            initial = await uow.timekeeping.get_timesheet(identifier)
            if initial is None:
                _fail("NOT_FOUND", "Табель не найден", 404)
            period_status = await uow.payroll_periods.lock_period(initial.year, initial.month)
            if period_status == "CLOSED":
                _fail("PERIOD_CLOSED", "Расчётный период закрыт")
            sheet = await uow.timekeeping.get_timesheet(identifier, for_update=True)
            if sheet is None:
                _fail("NOT_FOUND", "Табель не найден", 404)
            if str(sheet.status) != "SUBMITTED":
                _fail("TIMESHEET_STATE_INVALID", "Табель нельзя обработать в текущем состоянии")
            employee = await uow.timekeeping.employee(sheet.employeeId)
            if employee is None:
                _fail("NOT_FOUND", "Сотрудник не найден", 404)
            if actor.employee_id == sheet.employeeId or not actor.access.allows(
                "timekeeping.timesheets.review", {"departmentId": employee.departmentId}
            ):
                _fail("TIMESHEET_DECISION_FORBIDDEN", "Недостаточно прав", 403)
            if value.decision == "RETURN" and not value.reason:
                _fail("APPROVAL_REASON_REQUIRED", "Укажите причину возврата", 422)
            reviewer = await uow.timekeeping.reviewer_for(sheet.employeeId)
            if reviewer is None:
                _fail("TIMESHEET_DECISION_FORBIDDEN", "Сотрудник для согласования не найден", 403)
            in_scope = actor.access.allows(
                "timekeeping.timesheets.review", {"departmentId": employee.departmentId}
            )
            is_privileged = any(role in {"ADMIN", "HR"} for role in actor.access.roles)
            if reviewer["fallback"]:
                if not is_privileged or not in_scope or not value.reason:
                    _fail(
                        "TIMESHEET_DECISION_FORBIDDEN",
                        "Укажите причину и проверьте область доступа",
                        403,
                    )
            elif actor.actor_id != reviewer["approverId"] or not in_scope:
                _fail(
                    "TIMESHEET_DECISION_FORBIDDEN",
                    "Согласовать табель должен руководитель подразделения",
                    403,
                )
            approval = await uow.approvals.get_pending_for_entity("Timesheet", identifier)
            if approval is None:
                _fail("TIMESHEET_APPROVAL_NOT_FOUND", "Не найдено согласование табеля")
            approval_result = await decide_approval_in_uow(
                approval["id"],
                ApprovalDecisionCommand(
                    decision="APPROVE" if value.decision == "APPROVE" else "REJECT",
                    comment=value.reason,
                ),
                context,
                uow,
            )
            expected_approval_status = "APPROVED" if value.decision == "APPROVE" else "REJECTED"
            if approval_result["status"] != expected_approval_status:
                _fail("TIMESHEET_APPROVAL_INCOMPLETE", "Согласование табеля не завершено")
            status = (
                TimesheetStatus.APPROVED
                if value.decision == "APPROVE"
                else TimesheetStatus.RETURNED
            )
            now = datetime.now(UTC).replace(tzinfo=None)
            updated = await uow.timekeeping.save_timesheet(
                {
                    "status": status,
                    "decidedById": actor.actor_id,
                    "decidedAt": now,
                    "decisionReason": value.reason,
                },
                identifier,
            )
            await uow.audit.append(
                AuditRecord(
                    "TIMESHEET_APPROVE" if value.decision == "APPROVE" else "TIMESHEET_RETURN",
                    "Timesheet",
                    identifier,
                    actor.actor_id,
                    {
                        "employeeId": sheet.employeeId,
                        "year": sheet.year,
                        "month": sheet.month,
                        "reason": value.reason,
                    },
                    context.request_id,
                )
            )
            await uow.commit()
            return {
                "id": updated.id,
                "employeeId": updated.employeeId,
                "year": updated.year,
                "month": updated.month,
                "status": str(updated.status),
                "decidedById": updated.decidedById,
                "decidedAt": updated.decidedAt,
                "decisionReason": updated.decisionReason,
            }
