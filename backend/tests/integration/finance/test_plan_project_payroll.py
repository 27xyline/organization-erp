from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.context import Actor, RequestContext
from app.db.uow import SqlAlchemyUnitOfWorkFactory
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.models.departments import Department
from app.models.employees import Employee
from app.models.finance import FinancePlanEntry
from app.models.projects import Project, ProjectMember
from app.models.timekeeping import StaffSchedule
from app.services.finance import FinanceService


def _context(suffix: str) -> RequestContext:
    user_id = f"s10-user-{suffix}"
    return RequestContext(
        request_id=f"s10-finance-{suffix}",
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


@pytest.mark.anyio
async def test_finance_plan_replace_and_clear_update_project_actual_budget_atomically(
    db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    suffix = uuid4().hex
    department_id = f"s10-dept-{suffix}"
    employee_id = f"s10-employee-{suffix}"
    schedule_id = f"s10-schedule-{suffix}"
    project_a_id = f"s10-project-a-{suffix}"
    project_b_id = f"s10-project-b-{suffix}"
    year, month = 2026, 10
    async with db_session_factory() as seed:
        seed.add(Department(id=department_id, code=f"S10{suffix}", name=f"S10 {suffix}"))
        await seed.flush()
        seed.add_all(
            [
                StaffSchedule(
                    id=schedule_id,
                    position="Engineer",
                    department="finance",
                    departmentId=department_id,
                    rate=Decimal("1.00"),
                    salary=Decimal("1000.00"),
                ),
                Project(id=project_a_id, code=f"A{suffix}", name="A", actualBudget=Decimal("0")),
                Project(id=project_b_id, code=f"B{suffix}", name="B", actualBudget=Decimal("0")),
            ]
        )
        await seed.flush()
        seed.add(
            Employee(
                id=employee_id,
                code=f"S10{suffix}",
                fullName="finance Finance Employee",
                department="finance",
                departmentId=department_id,
                staffScheduleId=schedule_id,
            )
        )
        await seed.commit()
    service = FinanceService(SqlAlchemyUnitOfWorkFactory(db_session_factory))
    context = _context(suffix)
    try:
        saved = await service.save_plan(
            {
                "year": year,
                "month": month,
                "type": "nadbavka",
                "employeeId": employee_id,
                "allocations": [
                    {"projectId": project_b_id, "amount": "5,10"},
                    {"projectId": project_a_id, "amount": "4.20"},
                ],
            },
            context,
        )
        assert saved["cell"]["amount"] == "9.30"
        assert [item["amount"] for item in saved["cell"]["allocations"]] == ["4.20", "5.10"]
        assert {item["actualBudget"] for item in saved["projects"]} == {"4.20", "5.10"}
        plan_table = await service.get_plan_table("nadbavka", year, context)
        row = next(row for row in plan_table["rows"] if row["employeeId"] == employee_id)
        assert row["rate"] == "1.00" and row["salary"] == "1000.00"
        assert row["months"][str(month)]["amount"] == "9.30"
        salary_table = await service.get_salary_table(year, context)
        salary_row = next(row for row in salary_table["rows"] if row["employeeId"] == employee_id)
        assert salary_row["months"][str(month)]["amount"] == "9.30"
        salary_cell = salary_row["months"][str(month)]
        assert set(salary_cell["projectLabel"].split(", ")) == {f"A{suffix}", f"B{suffix}"}
        assert {item["amount"] for item in salary_cell["details"]} == {"4.20", "5.10"}
        async with db_session_factory() as check:
            actual = dict(
                (row.id, row.actualBudget)
                for row in (
                    await check.scalars(
                        select(Project).where(Project.id.in_([project_a_id, project_b_id]))
                    )
                ).all()
            )
            assert actual == {project_a_id: Decimal("4.20"), project_b_id: Decimal("5.10")}

        await service.clear_plan(
            {"year": year, "month": month, "type": "nadbavka", "employeeId": employee_id},
            context,
        )
        async with db_session_factory() as check:
            projects = list(
                (
                    await check.scalars(
                        select(Project).where(Project.id.in_([project_a_id, project_b_id]))
                    )
                ).all()
            )
            assert all(project.actualBudget == Decimal("0.00") for project in projects)
            entries = list(
                (
                    await check.scalars(
                        select(FinancePlanEntry).where(FinancePlanEntry.employeeId == employee_id)
                    )
                ).all()
            )
            assert entries == []
    finally:
        async with db_session_factory() as cleanup:
            await cleanup.execute(
                FinancePlanEntry.__table__.delete().where(
                    FinancePlanEntry.employeeId == employee_id
                )
            )
            await cleanup.execute(
                ProjectMember.__table__.delete().where(ProjectMember.employeeId == employee_id)
            )
            await cleanup.execute(Employee.__table__.delete().where(Employee.id == employee_id))
            await cleanup.execute(
                StaffSchedule.__table__.delete().where(StaffSchedule.id == schedule_id)
            )
            await cleanup.execute(
                Project.__table__.delete().where(Project.id.in_([project_a_id, project_b_id]))
            )
            await cleanup.execute(
                Department.__table__.delete().where(Department.id == department_id)
            )
            await cleanup.commit()


@pytest.mark.anyio
async def test_project_payroll_replacement_and_clear_adjust_actual_budget(
    db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    suffix = uuid4().hex
    department_id = f"s10-dept-{suffix}"
    employee_id = f"s10-employee-{suffix}"
    project_id = f"s10-project-{suffix}"
    member_id = f"s10-member-{suffix}"
    year, month = 2026, 11
    async with db_session_factory() as seed:
        seed.add(Department(id=department_id, code=f"S10{suffix}", name=f"S10 {suffix}"))
        await seed.flush()
        seed.add_all(
            [
                Employee(
                    id=employee_id,
                    code=f"S10{suffix}",
                    fullName="finance Payroll Employee",
                    department="finance",
                    departmentId=department_id,
                ),
                Project(
                    id=project_id, code=f"P{suffix}", name="Project", actualBudget=Decimal("0")
                ),
            ]
        )
        await seed.flush()
        seed.add(
            ProjectMember(
                id=member_id,
                projectId=project_id,
                employeeId=employee_id,
                department="finance",
                position="Engineer",
                rate=Decimal("1.00"),
                salary=Decimal("1200.00"),
            )
        )
        await seed.commit()
    service = FinanceService(SqlAlchemyUnitOfWorkFactory(db_session_factory))
    context = _context(suffix)
    try:
        project_table = await service.get_project_payroll(project_id, year, context)
        assert project_table["project"] == {
            "id": project_id,
            "code": f"P{suffix}",
            "name": "Project",
        }
        assert project_table["summary"]["totalRate"] == "1.00"
        assert project_table["summary"]["totalSalary"] == "1200.00"
        assert project_table["summary"]["monthTotals"][str(month)] == "0.00"
        saved = await service.save_project_payroll(
            project_id,
            {
                "year": year,
                "month": month,
                "employeeId": employee_id,
                "okladEnabled": True,
                "nadbavkaAmount": "100.20",
            },
            context,
        )
        assert saved["cell"]["amount"] == "1300.20"
        project_table = await service.get_project_payroll(project_id, year, context)
        assert project_table["rows"][0]["months"][str(month)]["amount"] == "1300.20"
        assert project_table["summary"]["monthTotals"][str(month)] == "1300.20"
        replaced = await service.save_project_payroll(
            project_id,
            {
                "year": year,
                "month": month,
                "employeeId": employee_id,
                "okladEnabled": False,
                "nadbavkaAmount": "50.00",
            },
            context,
        )
        assert replaced["cell"]["amount"] == "50.00"
        async with db_session_factory() as check:
            project = await check.get(Project, project_id)
            assert project is not None and project.actualBudget == Decimal("50.00")
        await service.clear_project_payroll(
            project_id, {"year": year, "month": month, "employeeId": employee_id}, context
        )
        async with db_session_factory() as check:
            project = await check.get(Project, project_id)
            assert project is not None and project.actualBudget == Decimal("0.00")
    finally:
        async with db_session_factory() as cleanup:
            await cleanup.execute(
                ProjectMember.__table__.delete().where(ProjectMember.id == member_id)
            )
            await cleanup.execute(
                FinancePlanEntry.__table__.delete().where(
                    FinancePlanEntry.employeeId == employee_id,
                    FinancePlanEntry.projectId == project_id,
                )
            )
            await cleanup.execute(Employee.__table__.delete().where(Employee.id == employee_id))
            await cleanup.execute(Project.__table__.delete().where(Project.id == project_id))
            await cleanup.execute(
                Department.__table__.delete().where(Department.id == department_id)
            )
            await cleanup.commit()
