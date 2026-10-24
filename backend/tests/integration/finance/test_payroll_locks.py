from __future__ import annotations

import asyncio
from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.context import Actor, RequestContext
from app.db.uow import SqlAlchemyUnitOfWorkFactory
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.domain.errors import DomainError
from app.models.approvals import ApprovalRequest
from app.models.departments import Department
from app.models.employees import Employee
from app.models.enums import TimeEntryType
from app.models.finance import PayrollPeriod
from app.models.timekeeping import TimeEntry, Timesheet
from app.models.users import AuditLog, User, UserRoleAssignment
from app.repositories.payroll_periods import SqlAlchemyPayrollPeriodRepository
from app.schemas.timekeeping import (
    SubmitTimesheetInput,
    TimeEntryUpdateInput,
    TimesheetDecisionInput,
)
from app.services.finance_periods import PayrollPeriodService
from app.services.timekeeping import TimekeepingService
from tests.audit_cleanup import clear_audit_logs_for_test_cleanup


def _context(
    user_id: str,
    role: str,
    *,
    employee_id: str | None = None,
    department_id: str | None = None,
    request_id: str,
) -> RequestContext:
    return RequestContext(
        request_id=request_id,
        actor=Actor(
            actor_id=user_id,
            employee_id=employee_id,
            is_authenticated=True,
            access=AccessContext(
                user_id=user_id,
                employee_id=employee_id,
                employee_department_id=department_id,
                member_project_ids=(),
                grants=(
                    ScopeGrant(
                        assignment_id=f"s10-grant-{request_id}",
                        role=role,
                        department_scope_mode="ALL" if role != "EMPLOYEE" else "SELF",
                        project_scope_mode="ALL" if role != "EMPLOYEE" else "NONE",
                    ),
                ),
            ),
        ),
    )


def _pause_period_status_change(monkeypatch: pytest.MonkeyPatch):
    lock_acquired = asyncio.Event()
    release_close = asyncio.Event()
    original = SqlAlchemyPayrollPeriodRepository.set_status

    async def paused(self, year, month, status, actor_id, reason=None):
        await self.lock_period(year, month)
        lock_acquired.set()
        await release_close.wait()
        return await original(self, year, month, status, actor_id, reason)

    monkeypatch.setattr(SqlAlchemyPayrollPeriodRepository, "set_status", paused)
    return lock_acquired, release_close


@pytest.mark.anyio
async def test_real_close_service_serializes_real_time_entry_update(
    stage10_session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    suffix = uuid4().hex
    user_id, department_id = f"s10-user-{suffix}", f"s10-dept-{suffix}"
    employee_id, entry_id = f"s10-employee-{suffix}", f"s10-entry-{suffix}"
    year, month = 2000 + int(suffix[:2], 16) % 101, 1 + int(suffix[2:4], 16) % 12
    work_date = date(year, month, 12)
    async with stage10_session_factory() as seed:
        seed.add(Department(id=department_id, code=f"S10{suffix}", name=f"S10 {suffix}"))
        await seed.flush()
        seed.add_all(
            [
                User(id=user_id, username=f"s10-{suffix}", name="Admin", passwordHash="x"),
                Employee(
                    id=employee_id,
                    code=f"S10{suffix}",
                    fullName="Worker",
                    department="Stage10",
                    departmentId=department_id,
                ),
            ]
        )
        await seed.flush()
        seed.add_all(
            [
                TimeEntry(
                    id=entry_id,
                    employeeId=employee_id,
                    workDate=work_date,
                    type=TimeEntryType.REGULAR,
                    hours=Decimal("2.00"),
                ),
                Timesheet(
                    id=f"s10-sheet-{suffix}",
                    employeeId=employee_id,
                    year=year,
                    month=month,
                    status="APPROVED",
                    zeroHoursConfirmed=False,
                    submittedById=user_id,
                    decidedById=user_id,
                ),
            ]
        )
        await seed.commit()

    context = _context(user_id, "ADMIN", request_id=f"s10-race-edit-{suffix}")
    periods = PayrollPeriodService(SqlAlchemyUnitOfWorkFactory(stage10_session_factory))
    timekeeping = TimekeepingService(SqlAlchemyUnitOfWorkFactory(stage10_session_factory))
    lock_acquired, release_close = _pause_period_status_change(monkeypatch)
    closing: asyncio.Task[dict[str, object]] | None = None
    writer: asyncio.Task[dict[str, object]] | None = None
    try:
        closing = asyncio.create_task(periods.set_status(year, month, "CLOSED", context))
        await asyncio.wait_for(lock_acquired.wait(), timeout=3)
        writer = asyncio.create_task(
            timekeeping.update(
                entry_id,
                TimeEntryUpdateInput(hours=Decimal("3.00"), correctionReason="Approved correction"),
                context,
            )
        )
        await asyncio.sleep(0.1)
        assert not writer.done(), "time-entry update should wait for real close row lock"
        release_close.set()
        closed = await closing
        assert closed["status"] == "CLOSED"
        with pytest.raises(DomainError) as rejected:
            await asyncio.wait_for(writer, timeout=3)
        assert rejected.value.code == "PERIOD_CLOSED"
        async with stage10_session_factory() as verify:
            entry = await verify.get(TimeEntry, entry_id)
            sheet = await verify.scalar(
                select(Timesheet).where(Timesheet.employeeId == employee_id)
            )
            audit = list(
                (
                    await verify.scalars(
                        select(AuditLog).where(AuditLog.requestId == context.request_id)
                    )
                ).all()
            )
            assert entry is not None and entry.hours == Decimal("2.00")
            assert sheet is not None and str(sheet.status) == "APPROVED"
            assert [item.action for item in audit] == ["PAYROLL_PERIOD_CLOSE"]
    finally:
        release_close.set()
        await asyncio.gather(
            *(task for task in (closing, writer) if task is not None), return_exceptions=True
        )
        async with stage10_session_factory() as cleanup:
            await clear_audit_logs_for_test_cleanup(cleanup)
            await cleanup.execute(
                AuditLog.__table__.delete().where(AuditLog.requestId == context.request_id)
            )
            await cleanup.execute(
                PayrollPeriod.__table__.delete().where(
                    PayrollPeriod.year == year, PayrollPeriod.month == month
                )
            )
            await cleanup.execute(
                Timesheet.__table__.delete().where(Timesheet.employeeId == employee_id)
            )
            await cleanup.execute(TimeEntry.__table__.delete().where(TimeEntry.id == entry_id))
            await cleanup.execute(Employee.__table__.delete().where(Employee.id == employee_id))
            await cleanup.execute(User.__table__.delete().where(User.id == user_id))
            await cleanup.execute(
                Department.__table__.delete().where(Department.id == department_id)
            )
            await cleanup.commit()


@pytest.mark.anyio
async def test_real_close_and_approve_serialize_pending_timesheet_without_partial_audit(
    stage10_session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    suffix = uuid4().hex
    department_id = f"s10-dept-{suffix}"
    worker_id, head_id = f"s10-worker-{suffix}", f"s10-head-{suffix}"
    worker_user_id, head_user_id, admin_user_id = (
        f"s10-worker-user-{suffix}",
        f"s10-head-user-{suffix}",
        f"s10-admin-user-{suffix}",
    )
    role_id, admin_role_id = f"s10-role-{suffix}", f"s10-admin-role-{suffix}"
    year, month = 2000 + int(suffix[:2], 16) % 101, 1 + int(suffix[2:4], 16) % 12
    async with stage10_session_factory() as seed:
        seed.add(Department(id=department_id, code=f"S10{suffix}", name=f"S10 {suffix}"))
        await seed.flush()
        seed.add_all(
            [
                Employee(
                    id=worker_id,
                    code=f"W{suffix}",
                    fullName="Worker",
                    department="Stage10",
                    departmentId=department_id,
                ),
                Employee(
                    id=head_id,
                    code=f"H{suffix}",
                    fullName="Head",
                    department="Stage10",
                    departmentId=department_id,
                ),
            ]
        )
        await seed.flush()
        department = await seed.get(Department, department_id)
        assert department is not None
        department.headEmployeeId = head_id
        seed.add_all(
            [
                User(
                    id=worker_user_id,
                    username=f"s10-w-{suffix}",
                    name="Worker",
                    passwordHash="x",
                    employeeId=worker_id,
                ),
                User(
                    id=head_user_id,
                    username=f"s10-h-{suffix}",
                    name="Head",
                    passwordHash="x",
                    employeeId=head_id,
                ),
                User(id=admin_user_id, username=f"s10-a-{suffix}", name="Admin", passwordHash="x"),
                TimeEntry(
                    id=f"s10-entry-{suffix}",
                    employeeId=worker_id,
                    workDate=date(year, month, 5),
                    type=TimeEntryType.REGULAR,
                    hours=Decimal("2.00"),
                ),
            ]
        )
        await seed.flush()
        seed.add(
            Timesheet(
                id=f"s10-head-sheet-{suffix}",
                employeeId=head_id,
                year=year,
                month=month,
                status="APPROVED",
                zeroHoursConfirmed=True,
                submittedById=head_user_id,
                decidedById=head_user_id,
            )
        )
        await seed.flush()
        seed.add(
            UserRoleAssignment(
                id=role_id,
                userId=head_user_id,
                role="DEPARTMENT_HEAD",
                departmentScopeMode="ALL",
                projectScopeMode="NONE",
            )
        )
        seed.add(
            UserRoleAssignment(
                id=admin_role_id,
                userId=admin_user_id,
                role="ADMIN",
                departmentScopeMode="ALL",
                projectScopeMode="ALL",
            )
        )
        await seed.commit()

    submitter = _context(
        worker_user_id,
        "EMPLOYEE",
        employee_id=worker_id,
        department_id=department_id,
        request_id=f"s10-submit-{suffix}",
    )
    reviewer = _context(
        head_user_id,
        "DEPARTMENT_HEAD",
        employee_id=head_id,
        department_id=department_id,
        request_id=f"s10-approve-{suffix}",
    )
    period_admin = _context(admin_user_id, "ADMIN", request_id=f"s10-close-{suffix}")
    periods = PayrollPeriodService(SqlAlchemyUnitOfWorkFactory(stage10_session_factory))
    timekeeping = TimekeepingService(SqlAlchemyUnitOfWorkFactory(stage10_session_factory))
    lock_acquired, release_close = _pause_period_status_change(monkeypatch)
    sheet_id: str | None = None
    try:
        submitted = await timekeeping.submit(
            SubmitTimesheetInput.model_construct(
                employeeId=worker_id, year=year, month=month, zeroHoursConfirmed=False
            ),
            submitter,
        )
        sheet_id = submitted["id"]
        closing = asyncio.create_task(periods.set_status(year, month, "CLOSED", period_admin))
        await asyncio.wait_for(lock_acquired.wait(), timeout=3)
        decision = asyncio.create_task(
            timekeeping.decide(sheet_id, TimesheetDecisionInput(decision="APPROVE"), reviewer)
        )
        await asyncio.sleep(0.1)
        assert not decision.done(), "approval decision should wait for real close row lock"
        release_close.set()
        with pytest.raises(DomainError) as pending:
            await asyncio.wait_for(closing, timeout=3)
        assert pending.value.code == "PAYROLL_TIMESHEETS_PENDING"
        approved = await asyncio.wait_for(decision, timeout=3)
        assert approved["status"] == "APPROVED"
        async with stage10_session_factory() as verify:
            sheet = await verify.get(Timesheet, sheet_id)
            assert sheet is not None and str(sheet.status) == "APPROVED"
            period = await verify.scalar(
                select(PayrollPeriod).where(
                    PayrollPeriod.year == year, PayrollPeriod.month == month
                )
            )
            assert period is None or str(period.status) == "OPEN"
            close_audits = list(
                (
                    await verify.scalars(
                        select(AuditLog).where(
                            AuditLog.action == "PAYROLL_PERIOD_CLOSE",
                            AuditLog.requestId == period_admin.request_id,
                        )
                    )
                ).all()
            )
            assert close_audits == []

        closed = await periods.set_status(year, month, "CLOSED", period_admin)
        assert closed["status"] == "CLOSED"
        with pytest.raises(DomainError) as post_close:
            await timekeeping.decide(sheet_id, TimesheetDecisionInput(decision="APPROVE"), reviewer)
        assert post_close.value.code == "PERIOD_CLOSED"
        async with stage10_session_factory() as verify:
            sheet = await verify.get(Timesheet, sheet_id)
            approval = await verify.scalar(
                select(ApprovalRequest).where(
                    ApprovalRequest.entityType == "Timesheet", ApprovalRequest.entityId == sheet_id
                )
            )
            audits = list(
                (
                    await verify.scalars(
                        select(AuditLog).where(
                            AuditLog.requestId.in_((reviewer.request_id, period_admin.request_id))
                        )
                    )
                ).all()
            )
            assert sheet is not None and str(sheet.status) == "APPROVED"
            assert approval is not None and str(approval.status) == "APPROVED"
            assert [item.action for item in audits].count("PAYROLL_PERIOD_CLOSE") == 1
            assert [item.action for item in audits].count("TIMESHEET_APPROVE") == 1
    finally:
        release_close.set()
        async with stage10_session_factory() as cleanup:
            await clear_audit_logs_for_test_cleanup(cleanup)
            await cleanup.execute(
                AuditLog.__table__.delete().where(
                    AuditLog.requestId.in_(
                        (submitter.request_id, reviewer.request_id, period_admin.request_id)
                    )
                )
            )
            await cleanup.execute(
                PayrollPeriod.__table__.delete().where(
                    PayrollPeriod.year == year, PayrollPeriod.month == month
                )
            )
            if sheet_id:
                approval_rows = list(
                    (
                        await cleanup.scalars(
                            select(ApprovalRequest).where(
                                ApprovalRequest.entityType == "Timesheet",
                                ApprovalRequest.entityId == sheet_id,
                            )
                        )
                    ).all()
                )
                for row in approval_rows:
                    await cleanup.delete(row)
                await cleanup.execute(
                    AuditLog.__table__.delete().where(
                        AuditLog.requestId.in_(
                            (submitter.request_id, reviewer.request_id, period_admin.request_id)
                        )
                    )
                )
                await cleanup.execute(Timesheet.__table__.delete().where(Timesheet.id == sheet_id))
            await cleanup.execute(
                Timesheet.__table__.delete().where(Timesheet.id == f"s10-head-sheet-{suffix}")
            )
            await cleanup.execute(
                TimeEntry.__table__.delete().where(TimeEntry.employeeId == worker_id)
            )
            await cleanup.execute(
                UserRoleAssignment.__table__.delete().where(
                    UserRoleAssignment.id.in_((role_id, admin_role_id))
                )
            )
            await cleanup.execute(
                User.__table__.delete().where(
                    User.id.in_((worker_user_id, head_user_id, admin_user_id))
                )
            )
            await cleanup.execute(
                Employee.__table__.delete().where(Employee.id.in_((worker_id, head_id)))
            )
            await cleanup.execute(
                Department.__table__.delete().where(Department.id == department_id)
            )
            await cleanup.commit()
