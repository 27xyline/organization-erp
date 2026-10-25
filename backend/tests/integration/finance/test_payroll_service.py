from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.context import Actor, RequestContext
from app.db.uow import SqlAlchemyUnitOfWorkFactory
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.integrations.payroll_export import OpenpyxlPayrollWorkbook
from app.models.departments import Department
from app.models.employees import Employee
from app.models.enums import EmployeeStatus, FinancePlanType, PayrollAdjustmentType
from app.models.finance import FinancePlanEntry, PayrollAdjustment, PayrollPeriod, SalaryEntry
from app.models.projects import Project
from app.models.timekeeping import StaffSchedule
from app.models.users import AuditLog, User, UserRoleAssignment
from app.services.payroll import PayrollService
from tests.audit_cleanup import clear_audit_logs_for_test_cleanup


def _context(
    user_id: str,
    request_id: str,
    *,
    role: str = "ADMIN",
    department_scope_mode: str = "ALL",
    department_ids: tuple[str, ...] = (),
) -> RequestContext:
    return RequestContext(
        request_id=request_id,
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
                        assignment_id=f"s10-admin-{request_id}",
                        role=role,
                        department_scope_mode=department_scope_mode,
                        project_scope_mode="ALL",
                        department_ids=department_ids,
                    ),
                ),
            ),
        ),
    )


@pytest.mark.anyio
async def test_payroll_month_matches_legacy_golden_fields_and_numbers(
    stage10_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    suffix = uuid4().hex
    user_id = f"s10-user-{suffix}"
    department_id = f"s10-dept-{suffix}"
    outside_department_id = f"s10-outside-dept-{suffix}"
    employee_id = f"s10-employee-{suffix}"
    dismissed_id = f"s10-dismissed-{suffix}"
    outside_employee_id = f"s10-outside-employee-{suffix}"
    schedule_id = f"s10-schedule-{suffix}"
    project_id = f"s10-project-{suffix}"
    year, month = 2026, 10
    async with stage10_session_factory() as seed:
        seed.add_all(
            [
                Department(id=department_id, code=f"S10{suffix}", name=f"Stage10 {suffix}"),
                Department(id=outside_department_id, code=f"OUT{suffix}", name=f"Outside {suffix}"),
            ]
        )
        await seed.flush()
        seed.add_all(
            [
                User(id=user_id, username=f"s10-{suffix}", name="Admin", passwordHash="x"),
                StaffSchedule(
                    id=schedule_id,
                    position="Engineer",
                    department="Engineering",
                    departmentId=department_id,
                    rate=Decimal("0.50"),
                    salary=Decimal("1000.00"),
                ),
                Project(
                    id=project_id,
                    code=f"P{suffix}",
                    name="Payroll project",
                    status="ACTIVE",
                    plannedBudget=Decimal("500.00"),
                    actualBudget=Decimal("100.00"),
                    endDate=datetime(2026, 12, 20),
                ),
            ]
        )
        await seed.flush()
        seed.add_all(
            [
                UserRoleAssignment(
                    id=f"s10-role-{suffix}",
                    userId=user_id,
                    role="ADMIN",
                    departmentScopeMode="ALL",
                    projectScopeMode="ALL",
                ),
                Employee(
                    id=employee_id,
                    code=f"S10{suffix}",
                    fullName="Payroll Worker",
                    department="Engineering",
                    departmentId=department_id,
                    staffScheduleId=schedule_id,
                    employmentRate=Decimal("0.50"),
                ),
                Employee(
                    id=dismissed_id,
                    code=f"D{suffix}",
                    fullName="Dismissed Worker",
                    department="Engineering",
                    departmentId=department_id,
                    status=EmployeeStatus.DISMISSED,
                ),
                Employee(
                    id=outside_employee_id,
                    code=f"OUT{suffix}",
                    fullName="Outside Worker",
                    department="Outside",
                    departmentId=outside_department_id,
                ),
            ]
        )
        await seed.flush()
        seed.add_all(
            [
                SalaryEntry(
                    id=f"s10-salary-{suffix}",
                    employeeId=employee_id,
                    year=year,
                    month=month,
                    amount=Decimal("700.00"),
                ),
                FinancePlanEntry(
                    id=f"s10-plan-base-{suffix}",
                    employeeId=employee_id,
                    projectId=project_id,
                    year=year,
                    month=month,
                    type=FinancePlanType.OKLAD,
                    amount=Decimal("600.00"),
                ),
                FinancePlanEntry(
                    id=f"s10-plan-allowance-{suffix}",
                    employeeId=employee_id,
                    projectId=project_id,
                    year=year,
                    month=month,
                    type=FinancePlanType.NADBAVKA,
                    amount=Decimal("100.00"),
                ),
                PayrollAdjustment(
                    id=f"s10-bonus-{suffix}",
                    employeeId=employee_id,
                    projectId=project_id,
                    year=year,
                    month=month,
                    type=PayrollAdjustmentType.BONUS,
                    amount=Decimal("10.01"),
                    description="Quarter bonus",
                ),
                PayrollAdjustment(
                    id=f"s10-one-time-{suffix}",
                    employeeId=employee_id,
                    projectId=None,
                    year=year,
                    month=month,
                    type=PayrollAdjustmentType.ONE_TIME,
                    amount=Decimal("2.50"),
                    description="Travel payment",
                ),
                PayrollAdjustment(
                    id=f"s10-deduction-{suffix}",
                    employeeId=employee_id,
                    projectId=project_id,
                    year=year,
                    month=month,
                    type=PayrollAdjustmentType.DEDUCTION,
                    amount=Decimal("3.01"),
                    description="Correction",
                ),
            ]
        )
        await seed.commit()

    service = PayrollService(
        SqlAlchemyUnitOfWorkFactory(stage10_session_factory), OpenpyxlPayrollWorkbook()
    )
    try:
        result = await service.get_month(
            year,
            month,
            _context(
                user_id,
                f"s10-payroll-{suffix}",
                role="ACCOUNTANT",
                department_scope_mode="ASSIGNED",
                department_ids=(department_id,),
            ),
        )
        row = next(item for item in result["rows"] if item["employeeId"] == employee_id)
        assert {
            key: row[key]
            for key in (
                "employeeId",
                "code",
                "fullName",
                "department",
                "position",
                "rate",
                "plannedBase",
                "actualBase",
                "allowance",
                "bonus",
                "oneTime",
                "deduction",
                "plannedGross",
                "gross",
                "tax",
                "contributions",
                "payable",
                "employerCost",
                "variance",
            )
        } == {
            "employeeId": employee_id,
            "code": f"S10{suffix}",
            "fullName": "Payroll Worker",
            "department": "Engineering",
            "position": "Engineer",
            "rate": 0.5,
            "plannedBase": 500.0,
            "actualBase": 700.0,
            "allowance": 100.0,
            "bonus": 10.01,
            "oneTime": 2.5,
            "deduction": 3.01,
            "plannedGross": 600.0,
            "gross": 809.5,
            "tax": 105.24,
            "contributions": 242.85,
            "payable": 704.26,
            "employerCost": 1052.35,
            "variance": 209.5,
        }
        assert all(
            isinstance(row[key], float)
            for key in (
                "rate",
                "plannedBase",
                "actualBase",
                "allowance",
                "bonus",
                "oneTime",
                "deduction",
                "plannedGross",
                "gross",
                "tax",
                "contributions",
                "payable",
                "employerCost",
                "variance",
            )
        )
        assert {item["type"] for item in row["adjustments"]} == {"BONUS", "ONE_TIME", "DEDUCTION"}
        assert {item["amount"] for item in row["adjustments"]} == {10.01, 2.5, 3.01}
        assert result["departmentTotals"] == [
            {
                "department": "Engineering",
                "planned": 600.0,
                "gross": 809.5,
                "payable": 704.26,
                "employerCost": 1052.35,
            }
        ]
        assert result["totals"] == {
            "planned": 600.0,
            "gross": 809.5,
            "tax": 105.24,
            "contributions": 242.85,
            "payable": 704.26,
            "employerCost": 1052.35,
        }
        assert result["period"]["status"] == "OPEN"
        assert result["options"]["employees"] == [
            {
                "id": employee_id,
                "code": f"S10{suffix}",
                "fullName": "Payroll Worker",
            }
        ]
        assert result["options"]["projects"] == [
            {
                "id": project_id,
                "code": f"P{suffix}",
                "name": "Payroll project",
            }
        ]
        assert result["projectForecasts"] == [
            {
                "id": project_id,
                "code": f"P{suffix}",
                "name": "Payroll project",
                "plannedBudget": 500.0,
                "actualBudget": 100.0,
                "monthlyPayroll": 707.0,
                "forecast": 2221.0,
                "variance": 1721.0,
            }
        ]
    finally:
        async with stage10_session_factory() as cleanup:
            await clear_audit_logs_for_test_cleanup(cleanup)
            await cleanup.execute(
                PayrollAdjustment.__table__.delete().where(
                    PayrollAdjustment.employeeId == employee_id
                )
            )
            await cleanup.execute(
                FinancePlanEntry.__table__.delete().where(
                    FinancePlanEntry.employeeId == employee_id
                )
            )
            await cleanup.execute(
                SalaryEntry.__table__.delete().where(SalaryEntry.employeeId == employee_id)
            )
            await cleanup.execute(
                Employee.__table__.delete().where(
                    Employee.id.in_((employee_id, dismissed_id, outside_employee_id))
                )
            )
            await cleanup.execute(
                UserRoleAssignment.__table__.delete().where(
                    UserRoleAssignment.id == f"s10-role-{suffix}"
                )
            )
            await cleanup.execute(
                StaffSchedule.__table__.delete().where(StaffSchedule.id == schedule_id)
            )
            await cleanup.execute(Project.__table__.delete().where(Project.id == project_id))
            await cleanup.execute(User.__table__.delete().where(User.id == user_id))
            await cleanup.execute(
                Department.__table__.delete().where(Department.id == department_id)
            )
            await cleanup.execute(
                Department.__table__.delete().where(Department.id == outside_department_id)
            )
            await cleanup.commit()


@pytest.mark.anyio
async def test_adjustment_create_and_delete_use_open_period_and_write_audit(
    stage10_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    suffix = uuid4().hex
    user_id = f"s10-user-{suffix}"
    employee_id = f"s10-employee-{suffix}"
    department_id = f"s10-dept-{suffix}"
    year, month = 2027, 2
    async with stage10_session_factory() as seed:
        seed.add(Department(id=department_id, code=f"S10{suffix}", name="Stage10"))
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
        seed.add(
            UserRoleAssignment(
                id=f"s10-role-{suffix}",
                userId=user_id,
                role="ADMIN",
                departmentScopeMode="ALL",
                projectScopeMode="ALL",
            )
        )
        await seed.commit()
    context = _context(user_id, f"s10-adjustment-{suffix}")
    service = PayrollService(
        SqlAlchemyUnitOfWorkFactory(stage10_session_factory), OpenpyxlPayrollWorkbook()
    )
    adjustment_id: str | None = None
    try:
        created = await service.create_adjustment(
            {
                "employeeId": employee_id,
                "projectId": None,
                "year": year,
                "month": month,
                "type": "BONUS",
                "amount": Decimal("12.50"),
                "description": "  Recognition bonus  ",
            },
            context,
        )
        adjustment_id = created["id"]
        assert created["employeeId"] == employee_id
        assert created["amount"] == 12.5
        assert created["description"] == "Recognition bonus"
        async with stage10_session_factory() as verify:
            record = await verify.get(PayrollAdjustment, adjustment_id)
            assert record is not None and record.amount == Decimal("12.50")
            audit_before = list(
                (
                    await verify.scalars(select(AuditLog).where(AuditLog.entityId == adjustment_id))
                ).all()
            )
            assert len(audit_before) == 1 and audit_before[0].action == "PAYROLL_ADJUSTMENT_CREATE"

        await service.remove_adjustment(adjustment_id, context)
        async with stage10_session_factory() as verify:
            assert await verify.get(PayrollAdjustment, adjustment_id) is None
            audit = list(
                (
                    await verify.scalars(select(AuditLog).where(AuditLog.entityId == adjustment_id))
                ).all()
            )
            assert {item.action for item in audit} == {
                "PAYROLL_ADJUSTMENT_CREATE",
                "PAYROLL_ADJUSTMENT_DELETE",
            }
    finally:
        async with stage10_session_factory() as cleanup:
            await clear_audit_logs_for_test_cleanup(cleanup)
            if adjustment_id:
                await cleanup.execute(
                    AuditLog.__table__.delete().where(AuditLog.entityId == adjustment_id)
                )
                await cleanup.execute(
                    PayrollAdjustment.__table__.delete().where(
                        PayrollAdjustment.id == adjustment_id
                    )
                )
            await cleanup.execute(
                UserRoleAssignment.__table__.delete().where(
                    UserRoleAssignment.id == f"s10-role-{suffix}"
                )
            )
            await cleanup.execute(Employee.__table__.delete().where(Employee.id == employee_id))
            await cleanup.execute(User.__table__.delete().where(User.id == user_id))
            await cleanup.execute(
                Department.__table__.delete().where(Department.id == department_id)
            )
            await cleanup.commit()


@pytest.mark.anyio
async def test_payroll_month_returns_legacy_scalar_fields_for_existing_period(
    stage10_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    suffix = uuid4().hex
    period_id = f"s10-period-{suffix}"
    year = 2000 + int(suffix[:4], 16) % 100
    month = 1 + int(suffix[4:6], 16) % 12
    async with stage10_session_factory() as seed:
        while await seed.scalar(
            select(PayrollPeriod.id).where(PayrollPeriod.year == year, PayrollPeriod.month == month)
        ):
            year = 2000 if year >= 2100 else year + 1
        seed.add(PayrollPeriod(id=period_id, year=year, month=month, status="OPEN"))
        await seed.commit()

    service = PayrollService(
        SqlAlchemyUnitOfWorkFactory(stage10_session_factory), OpenpyxlPayrollWorkbook()
    )
    try:
        result = await service.get_month(
            year, month, _context(f"s10-user-{suffix}", f"s10-period-contract-{suffix}")
        )
        period = result["period"]
        assert set(period) == {
            "id",
            "year",
            "month",
            "status",
            "closedAt",
            "closedById",
            "createdAt",
            "updatedAt",
            "closedBy",
        }
        assert period["id"] == period_id
        assert period["status"] == "OPEN"
        assert period["closedAt"] is None
        assert period["closedById"] is None
        assert period["closedBy"] is None
    finally:
        async with stage10_session_factory() as cleanup:
            await cleanup.execute(
                PayrollPeriod.__table__.delete().where(PayrollPeriod.id == period_id)
            )
            await cleanup.commit()
