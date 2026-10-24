from __future__ import annotations

import asyncio
from datetime import date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.context import Actor, RequestContext
from app.db.uow import SqlAlchemyUnitOfWork, SqlAlchemyUnitOfWorkFactory
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.domain.errors import DomainError
from app.models.approvals import ApprovalRequest, ApprovalStep
from app.models.departments import Department
from app.models.employees import Employee
from app.models.enums import AppRole, EmployeeStatus, PayrollPeriodStatus, ScopeMode, TimeEntryType
from app.models.finance import PayrollPeriod
from app.models.notifications import Notification
from app.models.projects import Project, Task
from app.models.timekeeping import TimeEntry, Timesheet
from app.models.users import AuditLog, User, UserRoleAssignment
from app.repositories.payroll_periods import SqlAlchemyPayrollPeriodRepository
from app.repositories.timekeeping import SqlAlchemyTimekeepingRepository
from app.schemas.timekeeping import (
    SubmitTimesheetInput,
    TimeEntryInput,
    TimeEntryUpdateInput,
    TimesheetDecisionInput,
)
from app.services.timekeeping import TimekeepingService
from tests.audit_cleanup import clear_audit_logs_for_test_cleanup


@pytest.mark.anyio
async def test_saved_time_entry_is_returned_with_serializable_relations(
    stage10_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    suffix = __import__("uuid").uuid4().hex
    department_id = f"s10-dept-{suffix}"
    employee_id = f"s10-employee-{suffix}"
    async with stage10_session_factory() as session:
        department = Department(id=department_id, code=f"S10{suffix}", name=f"S10 {suffix}")
        session.add(department)
        await session.flush()
        employee = Employee(
            id=employee_id,
            code=f"S10{suffix}",
            fullName="Stage10 fixture",
            department="Stage10",
            departmentId=department_id,
        )
        session.add(employee)
        await session.commit()
    try:
        async with stage10_session_factory() as session:
            repo = SqlAlchemyTimekeepingRepository(lambda: session)
            saved = await repo.save_entry(
                {
                    "employeeId": employee_id,
                    "projectId": None,
                    "taskId": None,
                    "workDate": date(2026, 10, 2),
                    "type": TimeEntryType.REGULAR,
                    "hours": 2,
                    "note": None,
                }
            )
            assert "employee" not in inspect(saved).unloaded
            assert saved.employee.id == employee_id
            await session.rollback()
    finally:
        async with stage10_session_factory() as cleanup:
            await cleanup.delete(await cleanup.get(Employee, employee_id))
            await cleanup.delete(await cleanup.get(Department, department_id))
            await cleanup.commit()


@pytest.mark.anyio
async def test_month_read_returns_options_summaries_and_virtual_timesheet(
    stage10_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    suffix = __import__("uuid").uuid4().hex
    department_id = f"s10-dept-{suffix}"
    employee_id = f"s10-employee-{suffix}"
    project_id = f"s10-project-{suffix}"
    task_id = f"s10-task-{suffix}"
    entry_id = f"s10-entry-{suffix}"
    year, month = 2000 + int(suffix[:2], 16) % 101, 1 + int(suffix[2:4], 16) % 12
    async with stage10_session_factory() as seed:
        seed.add(Department(id=department_id, code=f"S10{suffix}", name=f"S10 {suffix}"))
        await seed.flush()
        seed.add_all(
            [
                Employee(
                    id=employee_id,
                    code=f"S10{suffix}",
                    fullName="Stage10 employee",
                    department="Stage10",
                    departmentId=department_id,
                ),
                Project(id=project_id, code=f"S10P{suffix}", name="Stage10 project"),
            ]
        )
        await seed.flush()
        seed.add_all(
            [
                Task(id=task_id, name="Stage10 task", projectId=project_id),
                TimeEntry(
                    id=entry_id,
                    employeeId=employee_id,
                    projectId=project_id,
                    taskId=task_id,
                    workDate=date(year, month, 2),
                    type=TimeEntryType.REGULAR,
                    hours=Decimal("6.50"),
                ),
            ]
        )
        await seed.commit()
    context = RequestContext(
        request_id=f"s10-month-{suffix}",
        actor=Actor(
            actor_id=f"s10-reader-{suffix}",
            is_authenticated=True,
            access=AccessContext(
                user_id=f"s10-reader-{suffix}",
                employee_id=None,
                employee_department_id=None,
                member_project_ids=(),
                grants=(
                    ScopeGrant(
                        assignment_id=f"s10-admin-{suffix}",
                        role="ADMIN",
                        department_scope_mode="ALL",
                        project_scope_mode="ALL",
                    ),
                ),
            ),
        ),
    )
    try:
        data = await TimekeepingService(SqlAlchemyUnitOfWorkFactory(stage10_session_factory)).month(
            year, month, context
        )
        assert data["period"] == {"status": "OPEN"}
        assert data["normativeHours"] > 0
        entry = next(row for row in data["entries"] if row["id"] == entry_id)
        assert entry["hours"] == 6.5
        assert entry["employee"]["fullName"] == "Stage10 employee"
        assert employee_id in {item["id"] for item in data["employees"]}
        project = next(item for item in data["projects"] if item["id"] == project_id)
        assert project["tasksList"] == [{"id": task_id, "name": "Stage10 task"}]
        summary = next(item for item in data["summaries"] if item["employeeId"] == employee_id)
        assert summary["regularHours"] == 6.5
        assert summary["projectHours"] == 6.5
        sheet = next(item for item in data["timesheets"] if item["employeeId"] == employee_id)
        assert sheet["id"] == f"draft:{employee_id}:{year}:{month}"
    finally:
        async with stage10_session_factory() as cleanup:
            entry = await cleanup.get(TimeEntry, entry_id)
            if entry:
                await cleanup.delete(entry)
            task = await cleanup.get(Task, task_id)
            if task:
                await cleanup.delete(task)
            project = await cleanup.get(Project, project_id)
            if project:
                await cleanup.delete(project)
            employee = await cleanup.get(Employee, employee_id)
            if employee:
                await cleanup.delete(employee)
            department = await cleanup.get(Department, department_id)
            if department:
                await cleanup.delete(department)
            await cleanup.commit()


@pytest.mark.anyio
async def test_month_entries_order_by_employee_name_within_work_date(
    stage10_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    suffix = __import__("uuid").uuid4().hex
    department_id = f"s10-dept-{suffix}"
    first_employee_id = f"s10-employee-z{suffix}"
    second_employee_id = f"s10-employee-a{suffix}"
    first_entry_id = f"s10-entry-z{suffix}"
    second_entry_id = f"s10-entry-a{suffix}"
    year, month = 2000 + int(suffix[:2], 16) % 101, 1 + int(suffix[2:4], 16) % 12
    work_date = date(year, month, 2)
    async with stage10_session_factory() as seed:
        seed.add(Department(id=department_id, code=f"S10{suffix}", name=f"S10 {suffix}"))
        await seed.flush()
        seed.add_all(
            [
                Employee(
                    id=first_employee_id,
                    code=f"S10Z{suffix}",
                    fullName="A Worker",
                    department="Stage10",
                    departmentId=department_id,
                ),
                Employee(
                    id=second_employee_id,
                    code=f"S10A{suffix}",
                    fullName="Z Worker",
                    department="Stage10",
                    departmentId=department_id,
                ),
            ]
        )
        await seed.flush()
        seed.add_all(
            [
                TimeEntry(
                    id=first_entry_id,
                    employeeId=first_employee_id,
                    workDate=work_date,
                    type=TimeEntryType.REGULAR,
                    hours=Decimal("1.00"),
                ),
                TimeEntry(
                    id=second_entry_id,
                    employeeId=second_employee_id,
                    workDate=work_date,
                    type=TimeEntryType.REGULAR,
                    hours=Decimal("1.00"),
                ),
            ]
        )
        await seed.commit()
    context = RequestContext(
        request_id=f"s10-order-{suffix}",
        actor=Actor(
            actor_id=f"s10-reader-{suffix}",
            is_authenticated=True,
            access=AccessContext(
                user_id=f"s10-reader-{suffix}",
                employee_id=None,
                employee_department_id=None,
                member_project_ids=(),
                grants=(
                    ScopeGrant(
                        assignment_id=f"s10-admin-{suffix}",
                        role="ADMIN",
                        department_scope_mode="ALL",
                        project_scope_mode="ALL",
                    ),
                ),
            ),
        ),
    )
    try:
        data = await TimekeepingService(SqlAlchemyUnitOfWorkFactory(stage10_session_factory)).month(
            year, month, context
        )
        ordered_fixture_entries = [
            entry["id"]
            for entry in data["entries"]
            if entry["id"] in {first_entry_id, second_entry_id}
        ]
        assert ordered_fixture_entries == [first_entry_id, second_entry_id]
    finally:
        async with stage10_session_factory() as cleanup:
            for entry_id in (first_entry_id, second_entry_id):
                entry = await cleanup.get(TimeEntry, entry_id)
                if entry:
                    await cleanup.delete(entry)
            for employee_id in (first_employee_id, second_employee_id):
                employee = await cleanup.get(Employee, employee_id)
                if employee:
                    await cleanup.delete(employee)
            department = await cleanup.get(Department, department_id)
            if department:
                await cleanup.delete(department)
            await cleanup.commit()


@pytest.mark.anyio
async def test_period_status_read_does_not_create_missing_period_row(
    stage10_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    year, month = 2098, 11
    async with stage10_session_factory() as session:
        found = await SqlAlchemyPayrollPeriodRepository(lambda: session).get_status(year, month)
        assert found is None
        period_id = await session.scalar(
            select(PayrollPeriod.id).where(PayrollPeriod.year == year, PayrollPeriod.month == month)
        )
        assert period_id is None


@pytest.mark.anyio
async def test_reviewer_resolution_uses_eligible_department_head(
    stage10_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    suffix = __import__("uuid").uuid4().hex
    department_id = f"s10-dept-{suffix}"
    head_employee_id = f"s10-head-{suffix}"
    worker_id = f"s10-worker-{suffix}"
    head_user_id = f"s10-user-{suffix}"
    assignment_id = f"s10-assignment-{suffix}"
    async with stage10_session_factory() as session:
        session.add(Department(id=department_id, code=f"S10{suffix}", name=f"S10 {suffix}"))
        await session.flush()
        session.add_all(
            [
                Employee(
                    id=head_employee_id,
                    code=f"S10H{suffix}",
                    fullName="Head",
                    department="Stage10",
                    departmentId=department_id,
                ),
                Employee(
                    id=worker_id,
                    code=f"S10W{suffix}",
                    fullName="Worker",
                    department="Stage10",
                    departmentId=department_id,
                ),
                User(
                    id=head_user_id,
                    username=f"s10-{suffix}",
                    name="Head",
                    passwordHash="x",
                    employeeId=head_employee_id,
                ),
            ]
        )
        await session.flush()
        department = await session.get(Department, department_id)
        assert department is not None
        department.headEmployeeId = head_employee_id
        session.add(
            UserRoleAssignment(
                id=assignment_id,
                userId=head_user_id,
                role=AppRole.DEPARTMENT_HEAD,
                departmentScopeMode=ScopeMode.ALL,
                projectScopeMode=ScopeMode.NONE,
            )
        )
        await session.commit()
    try:
        async with stage10_session_factory() as session:
            reviewer = await SqlAlchemyTimekeepingRepository(lambda: session).reviewer_for(
                worker_id
            )
            assert reviewer == {
                "approverId": head_user_id,
                "approverEmployeeId": head_employee_id,
                "fallback": False,
            }
    finally:
        async with stage10_session_factory() as cleanup:
            assignment = await cleanup.get(UserRoleAssignment, assignment_id)
            if assignment:
                await cleanup.delete(assignment)
            user = await cleanup.get(User, head_user_id)
            if user:
                await cleanup.delete(user)
            for employee_id in (worker_id, head_employee_id):
                employee = await cleanup.get(Employee, employee_id)
                if employee:
                    await cleanup.delete(employee)
            department = await cleanup.get(Department, department_id)
            if department:
                await cleanup.delete(department)
            await cleanup.commit()


@pytest.mark.anyio
async def test_reviewer_resolution_skips_dismissed_department_head(
    stage10_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    suffix = __import__("uuid").uuid4().hex
    department_id = f"s10-dept-{suffix}"
    head_employee_id = f"s10-head-{suffix}"
    worker_id = f"s10-worker-{suffix}"
    head_user_id = f"s10-head-user-{suffix}"
    fallback_user_id = f"s10-fallback-{suffix}"
    head_assignment_id = f"s10-head-role-{suffix}"
    fallback_assignment_id = f"s10-fallback-role-{suffix}"
    async with stage10_session_factory() as session:
        session.add(Department(id=department_id, code=f"S10{suffix}", name=f"S10 {suffix}"))
        await session.flush()
        session.add_all(
            [
                Employee(
                    id=head_employee_id,
                    code=f"S10H{suffix}",
                    fullName="Dismissed head",
                    department="Stage10",
                    departmentId=department_id,
                    status=EmployeeStatus.DISMISSED,
                ),
                Employee(
                    id=worker_id,
                    code=f"S10W{suffix}",
                    fullName="Worker",
                    department="Stage10",
                    departmentId=department_id,
                ),
                User(
                    id=head_user_id,
                    username=f"s10-head-{suffix}",
                    name="Dismissed head",
                    passwordHash="x",
                    employeeId=head_employee_id,
                ),
                User(
                    id=fallback_user_id,
                    username=f"s10-fallback-{suffix}",
                    name="Fallback administrator",
                    passwordHash="x",
                ),
            ]
        )
        await session.flush()
        department = await session.get(Department, department_id)
        assert department is not None
        department.headEmployeeId = head_employee_id
        session.add_all(
            [
                UserRoleAssignment(
                    id=head_assignment_id,
                    userId=head_user_id,
                    role=AppRole.DEPARTMENT_HEAD,
                    departmentScopeMode=ScopeMode.ALL,
                    projectScopeMode=ScopeMode.NONE,
                ),
                UserRoleAssignment(
                    id=fallback_assignment_id,
                    userId=fallback_user_id,
                    role=AppRole.ADMIN,
                    departmentScopeMode=ScopeMode.ALL,
                    projectScopeMode=ScopeMode.ALL,
                ),
            ]
        )
        await session.commit()
    try:
        async with stage10_session_factory() as session:
            reviewer = await SqlAlchemyTimekeepingRepository(lambda: session).reviewer_for(
                worker_id
            )
            assert reviewer == {
                "approverId": fallback_user_id,
                "approverEmployeeId": None,
                "fallback": True,
            }
    finally:
        async with stage10_session_factory() as cleanup:
            for assignment_id in (head_assignment_id, fallback_assignment_id):
                assignment = await cleanup.get(UserRoleAssignment, assignment_id)
                if assignment:
                    await cleanup.delete(assignment)
            for user_id in (head_user_id, fallback_user_id):
                user = await cleanup.get(User, user_id)
                if user:
                    await cleanup.delete(user)
            for employee_id in (worker_id, head_employee_id):
                employee = await cleanup.get(Employee, employee_id)
                if employee:
                    await cleanup.delete(employee)
            department = await cleanup.get(Department, department_id)
            if department:
                await cleanup.delete(department)
            await cleanup.commit()


@pytest.mark.anyio
async def test_submit_creates_timesheet_approval_and_audit_in_same_uow(
    stage10_session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    suffix = __import__("uuid").uuid4().hex
    department_id = f"s10-dept-{suffix}"
    submitter_employee = f"s10-employee-{suffix}"
    head_employee = f"s10-head-{suffix}"
    submitter_id = f"s10-user-{suffix}"
    head_user_id = f"s10-head-user-{suffix}"
    role_id = f"s10-role-{suffix}"
    year, month = 2060 + int(suffix[:2], 16) % 30, 1 + int(suffix[2:4], 16) % 12
    async with stage10_session_factory() as session:
        session.add(Department(id=department_id, code=f"S10{suffix}", name=f"S10 {suffix}"))
        await session.flush()
        session.add_all(
            [
                Employee(
                    id=submitter_employee,
                    code=f"S10W{suffix}",
                    fullName="Worker",
                    department="Stage10",
                    departmentId=department_id,
                ),
                Employee(
                    id=head_employee,
                    code=f"S10H{suffix}",
                    fullName="Head",
                    department="Stage10",
                    departmentId=department_id,
                ),
            ]
        )
        await session.flush()
        department = await session.get(Department, department_id)
        assert department is not None
        department.headEmployeeId = head_employee
        session.add_all(
            [
                User(
                    id=submitter_id,
                    username=f"s10-worker-{suffix}",
                    name="Worker",
                    passwordHash="x",
                    employeeId=submitter_employee,
                ),
                User(
                    id=head_user_id,
                    username=f"s10-head-{suffix}",
                    name="Head",
                    passwordHash="x",
                    employeeId=head_employee,
                ),
            ]
        )
        await session.flush()
        session.add(
            UserRoleAssignment(
                id=role_id,
                userId=head_user_id,
                role=AppRole.DEPARTMENT_HEAD,
                departmentScopeMode=ScopeMode.ALL,
                projectScopeMode=ScopeMode.NONE,
            )
        )
        await session.commit()
    try:
        actor = Actor(
            actor_id=submitter_id,
            employee_id=submitter_employee,
            is_authenticated=True,
            access=AccessContext(
                user_id=submitter_id,
                employee_id=submitter_employee,
                employee_department_id=department_id,
                member_project_ids=(),
                grants=(
                    ScopeGrant(
                        assignment_id=f"s10-employee-role-{suffix}",
                        role="EMPLOYEE",
                        department_scope_mode="SELF",
                        project_scope_mode="NONE",
                    ),
                ),
            ),
        )
        context = RequestContext(request_id=f"s10-submit-{suffix}", actor=actor)
        result = await TimekeepingService(
            SqlAlchemyUnitOfWorkFactory(stage10_session_factory)
        ).submit(
            SubmitTimesheetInput.model_construct(
                employeeId=submitter_employee,
                year=year,
                month=month,
                zeroHoursConfirmed=True,
            ),
            context,
        )
        assert result["status"] == "SUBMITTED"
        reviewer_context = RequestContext(
            request_id=f"s10-decision-{suffix}",
            actor=Actor(
                actor_id=head_user_id,
                employee_id=head_employee,
                is_authenticated=True,
                access=AccessContext(
                    user_id=head_user_id,
                    employee_id=head_employee,
                    employee_department_id=department_id,
                    member_project_ids=(),
                    grants=(
                        ScopeGrant(
                            assignment_id=role_id,
                            role="DEPARTMENT_HEAD",
                            department_scope_mode="ALL",
                            project_scope_mode="NONE",
                        ),
                    ),
                ),
            ),
        )

        async def fail_commit(self: SqlAlchemyUnitOfWork) -> None:
            raise RuntimeError("injected commit failure")

        with monkeypatch.context() as patcher:
            patcher.setattr(SqlAlchemyUnitOfWork, "commit", fail_commit)
            with pytest.raises(RuntimeError, match="injected commit failure"):
                await TimekeepingService(
                    SqlAlchemyUnitOfWorkFactory(stage10_session_factory)
                ).decide(
                    result["id"],
                    TimesheetDecisionInput(decision="APPROVE"),
                    reviewer_context,
                )
        async with stage10_session_factory() as verify_rollback:
            approval_before = await verify_rollback.scalar(
                select(ApprovalRequest).where(
                    ApprovalRequest.entityType == "Timesheet",
                    ApprovalRequest.entityId == result["id"],
                )
            )
            sheet_before = await verify_rollback.get(Timesheet, result["id"])
            assert approval_before is not None and approval_before.status == "PENDING"
            assert sheet_before is not None and str(sheet_before.status) == "SUBMITTED"
            assert (
                await verify_rollback.scalar(
                    select(AuditLog.id).where(
                        AuditLog.action == "APPROVAL_APPROVE",
                        AuditLog.entityId == approval_before.id,
                    )
                )
                is None
            )
            assert (
                await verify_rollback.scalar(
                    select(Notification.id).where(
                        Notification.dedupeKey == f"approval:{approval_before.id}:result:APPROVED"
                    )
                )
                is None
            )
        timekeeping = TimekeepingService(SqlAlchemyUnitOfWorkFactory(stage10_session_factory))
        returned = await timekeeping.decide(
            result["id"],
            TimesheetDecisionInput(decision="RETURN", reason="Please correct the report"),
            reviewer_context,
        )
        assert returned["status"] == "RETURNED"
        await timekeeping.create(
            TimeEntryInput.model_construct(
                employeeId=submitter_employee,
                projectId=None,
                taskId=None,
                workDate=date(year, month, 3),
                type="REGULAR",
                hours=Decimal("2.00"),
                note="Added after return",
                correctionReason=None,
            ),
            context,
        )
        resubmitted = await timekeeping.submit(
            SubmitTimesheetInput.model_construct(
                employeeId=submitter_employee,
                year=year,
                month=month,
                zeroHoursConfirmed=True,
            ),
            context,
        )
        assert resubmitted["id"] == result["id"]
        async with stage10_session_factory() as after_resubmit:
            requests = list(
                (
                    await after_resubmit.scalars(
                        select(ApprovalRequest)
                        .where(
                            ApprovalRequest.entityType == "Timesheet",
                            ApprovalRequest.entityId == result["id"],
                        )
                        .order_by(ApprovalRequest.createdAt, ApprovalRequest.id)
                    )
                ).all()
            )
            assert [item.status for item in requests] == ["REJECTED", "PENDING"]
        decided = await timekeeping.decide(
            result["id"],
            TimesheetDecisionInput(decision="APPROVE"),
            reviewer_context,
        )
        assert decided["status"] == "APPROVED"
        async with stage10_session_factory() as verify:
            approval = await verify.scalar(
                select(ApprovalRequest).where(
                    ApprovalRequest.entityType == "Timesheet",
                    ApprovalRequest.entityId == result["id"],
                    ApprovalRequest.status == "APPROVED",
                )
            )
            assert approval is not None and approval.requestedById == submitter_id
            step = await verify.scalar(
                select(ApprovalStep).where(
                    ApprovalStep.requestId == approval.id,
                )
            )
            assert step is not None and step.approverId == head_user_id
            assert (
                await verify.scalar(
                    select(AuditLog.id).where(
                        AuditLog.entityType == "ApprovalRequest",
                        AuditLog.entityId == approval.id,
                    )
                )
                is not None
            )
            assert (
                await verify.scalar(
                    select(Notification.id).where(
                        Notification.dedupeKey == f"approval:{approval.id}:result:APPROVED"
                    )
                )
                is not None
            )
            assert approval.status == "APPROVED"
            saved_sheet = await verify.get(Timesheet, result["id"])
            assert saved_sheet is not None and str(saved_sheet.status) == "APPROVED"
    finally:
        async with stage10_session_factory() as cleanup:
            await clear_audit_logs_for_test_cleanup(cleanup)
            approvals = list(
                (
                    await cleanup.scalars(
                        select(ApprovalRequest).where(
                            ApprovalRequest.entityType == "Timesheet",
                            ApprovalRequest.entityId.in_(
                                select(Timesheet.id).where(
                                    Timesheet.employeeId == submitter_employee
                                )
                            ),
                        )
                    )
                ).all()
            )
            for approval in approvals:
                await cleanup.delete(approval)
            for entity in (UserRoleAssignment,):
                row = await cleanup.get(entity, role_id)
                if row:
                    await cleanup.delete(row)
            sheet = await cleanup.scalar(
                select(Timesheet).where(Timesheet.employeeId == submitter_employee)
            )
            if sheet:
                await cleanup.delete(sheet)
            entries = list(
                (
                    await cleanup.scalars(
                        select(TimeEntry).where(TimeEntry.employeeId == submitter_employee)
                    )
                ).all()
            )
            for entry in entries:
                await cleanup.delete(entry)
            for user_id in (submitter_id, head_user_id):
                user = await cleanup.get(User, user_id)
                if user:
                    await cleanup.delete(user)
            for employee_id in (submitter_employee, head_employee):
                employee = await cleanup.get(Employee, employee_id)
                if employee:
                    await cleanup.delete(employee)
            department = await cleanup.get(Department, department_id)
            if department:
                await cleanup.delete(department)
            period = await cleanup.scalar(
                select(PayrollPeriod).where(
                    PayrollPeriod.year == year,
                    PayrollPeriod.month == month,
                )
            )
            if period:
                await cleanup.delete(period)
            await cleanup.commit()


@pytest.mark.anyio
async def test_time_entry_update_waits_for_period_lock_then_rejects_closed_period(
    stage10_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    suffix = __import__("uuid").uuid4().hex
    department_id = f"s10-dept-{suffix}"
    employee_id = f"s10-employee-{suffix}"
    user_id = f"s10-user-{suffix}"
    entry_id = f"s10-entry-{suffix}"
    year, month = 2000 + int(suffix[:2], 16) % 101, 1 + int(suffix[2:4], 16) % 12
    work_date = date(year, month, 12)
    async with stage10_session_factory() as seed:
        seed.add(Department(id=department_id, code=f"S10{suffix}", name=f"S10 {suffix}"))
        await seed.flush()
        seed.add(
            Employee(
                id=employee_id,
                code=f"S10{suffix}",
                fullName="Worker",
                department="Stage10",
                departmentId=department_id,
            )
        )
        seed.add(
            User(
                id=user_id,
                username=f"s10-{suffix}",
                name="Admin",
                passwordHash="x",
            )
        )
        await seed.flush()
        seed.add(
            TimeEntry(
                id=entry_id,
                employeeId=employee_id,
                workDate=work_date,
                type=TimeEntryType.REGULAR,
                hours=Decimal("2.00"),
            )
        )
        await seed.commit()
    try:
        async with stage10_session_factory() as closer:
            repo = SqlAlchemyPayrollPeriodRepository(lambda: closer)
            assert await repo.lock_period(year, month) == "OPEN"
            period = await closer.scalar(
                select(PayrollPeriod).where(
                    PayrollPeriod.year == year,
                    PayrollPeriod.month == month,
                )
            )
            assert period is not None
            period.status = PayrollPeriodStatus.CLOSED
            period.closedAt = datetime.now()
            period.closedById = user_id
            await closer.flush()
            writer = asyncio.create_task(
                TimekeepingService(SqlAlchemyUnitOfWorkFactory(stage10_session_factory)).update(
                    entry_id,
                    TimeEntryUpdateInput(hours=Decimal("3.00")),
                    RequestContext(
                        request_id=f"s10-update-{suffix}",
                        actor=Actor(
                            actor_id=user_id,
                            is_authenticated=True,
                            access=AccessContext(
                                user_id=user_id,
                                employee_id=None,
                                employee_department_id=None,
                                member_project_ids=(),
                                grants=(
                                    ScopeGrant(
                                        assignment_id=f"s10-admin-{suffix}",
                                        role="ADMIN",
                                        department_scope_mode="ALL",
                                        project_scope_mode="ALL",
                                    ),
                                ),
                            ),
                        ),
                    ),
                )
            )
            await asyncio.sleep(0.1)
            assert not writer.done()
            await closer.commit()
            with pytest.raises(DomainError, match="Расчётный период закрыт") as error:
                await writer
            assert error.value.code == "PERIOD_CLOSED"
        async with stage10_session_factory() as verify:
            entry = await verify.get(TimeEntry, entry_id)
            assert entry is not None and entry.hours == Decimal("2.00")
    finally:
        async with stage10_session_factory() as cleanup:
            await clear_audit_logs_for_test_cleanup(cleanup)
            period = await cleanup.scalar(
                select(PayrollPeriod).where(
                    PayrollPeriod.year == year,
                    PayrollPeriod.month == month,
                )
            )
            if period:
                await cleanup.delete(period)
            entry = await cleanup.get(TimeEntry, entry_id)
            if entry:
                await cleanup.delete(entry)
            user = await cleanup.get(User, user_id)
            if user:
                await cleanup.delete(user)
            employee = await cleanup.get(Employee, employee_id)
            if employee:
                await cleanup.delete(employee)
            department = await cleanup.get(Department, department_id)
            if department:
                await cleanup.delete(department)
            await cleanup.commit()


@pytest.mark.anyio
async def test_corrected_entry_update_and_delete_reset_approved_timesheet(
    stage10_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    suffix = __import__("uuid").uuid4().hex
    department_id = f"s10-dept-{suffix}"
    employee_id = f"s10-employee-{suffix}"
    user_id = f"s10-user-{suffix}"
    entry_id = f"s10-entry-{suffix}"
    year, month = 2000 + int(suffix[:2], 16) % 101, 1 + int(suffix[2:4], 16) % 12
    work_date = date(year, month, 12)
    async with stage10_session_factory() as seed:
        seed.add(Department(id=department_id, code=f"S10{suffix}", name=f"S10 {suffix}"))
        await seed.flush()
        seed.add_all(
            [
                Employee(
                    id=employee_id,
                    code=f"S10{suffix}",
                    fullName="Worker",
                    department="Stage10",
                    departmentId=department_id,
                ),
                User(
                    id=user_id,
                    username=f"s10-{suffix}",
                    name="Administrator",
                    passwordHash="x",
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
                    employeeId=employee_id,
                    year=year,
                    month=month,
                    status="APPROVED",
                    submittedById=user_id,
                    decidedById=user_id,
                    submittedAt=datetime.now(),
                    decidedAt=datetime.now(),
                    decisionReason="Approved",
                ),
            ]
        )
        await seed.commit()
    context = RequestContext(
        request_id=f"s10-correction-{suffix}",
        actor=Actor(
            actor_id=user_id,
            is_authenticated=True,
            access=AccessContext(
                user_id=user_id,
                employee_id=None,
                employee_department_id=None,
                member_project_ids=(),
                grants=(
                    ScopeGrant(
                        assignment_id=f"s10-admin-{suffix}",
                        role="ADMIN",
                        department_scope_mode="ALL",
                        project_scope_mode="ALL",
                    ),
                ),
            ),
        ),
    )
    try:
        service = TimekeepingService(SqlAlchemyUnitOfWorkFactory(stage10_session_factory))
        await service.update(
            entry_id,
            TimeEntryUpdateInput(hours=Decimal("3.00"), correctionReason="Fix hours"),
            context,
        )
        async with stage10_session_factory() as after_update:
            update_audit = await after_update.scalar(
                select(AuditLog).where(
                    AuditLog.action == "TIME_ENTRY_CORRECTION",
                    AuditLog.entityId == entry_id,
                )
            )
            assert update_audit is not None
            assert update_audit.details["correctionReason"] == "Fix hours"
            sheet = await after_update.scalar(
                select(Timesheet).where(
                    Timesheet.employeeId == employee_id,
                    Timesheet.year == year,
                    Timesheet.month == month,
                )
            )
            assert sheet is not None and str(sheet.status) == "DRAFT"
            assert sheet.submittedById is None and sheet.decidedById is None
            sheet.status = "APPROVED"
            await after_update.commit()
        await service.remove(entry_id, context, correction_reason="Remove wrong entry")
        async with stage10_session_factory() as after_delete:
            correction_audits = list(
                (
                    await after_delete.scalars(
                        select(AuditLog)
                        .where(
                            AuditLog.action == "TIME_ENTRY_CORRECTION",
                            AuditLog.entityId == entry_id,
                        )
                        .order_by(AuditLog.createdAt, AuditLog.id)
                    )
                ).all()
            )
            assert [item.details["correctionReason"] for item in correction_audits] == [
                "Fix hours",
                "Remove wrong entry",
            ]
            sheet = await after_delete.scalar(
                select(Timesheet).where(
                    Timesheet.employeeId == employee_id,
                    Timesheet.year == year,
                    Timesheet.month == month,
                )
            )
            assert sheet is not None and str(sheet.status) == "DRAFT"
            assert sheet.submittedById is None and sheet.decidedById is None
    finally:
        async with stage10_session_factory() as cleanup:
            await clear_audit_logs_for_test_cleanup(cleanup)
            period = await cleanup.scalar(
                select(PayrollPeriod).where(
                    PayrollPeriod.year == year,
                    PayrollPeriod.month == month,
                )
            )
            if period:
                await cleanup.delete(period)
            sheet = await cleanup.scalar(
                select(Timesheet).where(Timesheet.employeeId == employee_id)
            )
            if sheet:
                await cleanup.delete(sheet)
            entry = await cleanup.get(TimeEntry, entry_id)
            if entry:
                await cleanup.delete(entry)
            user = await cleanup.get(User, user_id)
            if user:
                await cleanup.delete(user)
            employee = await cleanup.get(Employee, employee_id)
            if employee:
                await cleanup.delete(employee)
            department = await cleanup.get(Department, department_id)
            if department:
                await cleanup.delete(department)
            await cleanup.commit()
