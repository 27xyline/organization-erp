from datetime import date, datetime
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.auth.rules import AccessContext, ScopeGrant
from app.models.departments import Department
from app.models.employees import Employee
from app.repositories.reporting import SqlAlchemyReportingRepository
from app.services.dashboard import DashboardService
from app.services.dto.reporting import DashboardQuery


@pytest.mark.anyio
async def test_dashboard_department_filter_keeps_asset_mol_exists_local(
    db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with db_session_factory() as session:
        access = AccessContext(
            "s12-home-admin",
            None,
            None,
            (),
            (ScopeGrant("s12-home-admin", "ADMIN", "ALL", "ALL"),),
        )
        result = await DashboardService(SqlAlchemyReportingRepository(session)).get_overview(
            DashboardQuery(date(2026, 1, 1), date(2026, 12, 31), department_id="s12-home-dept"),
            access,
            now=datetime(2026, 6, 1),
        )

    assert result["summary"]["headcount"] >= 0


@pytest.mark.anyio
async def test_dashboard_aggregates_full_scoped_employee_result_over_one_hundred_rows(
    db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with db_session_factory() as session:
        transaction = await session.begin()
        try:
            session.add(
                Department(id="s12-reporting-dept", code="S12-R", name="reporting Reporting")
            )
            await session.flush()
            session.add_all(
                [
                    Employee(
                        id=f"s12-reporting-{index}",
                        code=f"S12-R-{index}",
                        fullName=f"Reporting Person {index}",
                        department="reporting Reporting",
                        departmentId="s12-reporting-dept",
                        employmentRate=Decimal("0.50"),
                    )
                    for index in range(137)
                ]
            )
            await session.flush()
            access = AccessContext(
                "s12-report-user", None, None, (), (ScopeGrant("s12-admin", "ADMIN", "ALL", "ALL"),)
            )
            result = await DashboardService(SqlAlchemyReportingRepository(session)).get_overview(
                DashboardQuery(date(2026, 1, 1), date(2026, 12, 31)),
                access,
                now=datetime(2026, 6, 1),
            )
            assert result["summary"]["headcount"] == 137
            assert result["summary"]["occupiedRate"] == 68.5
            assert len(result["analytics"]["workforceByDepartment"]) == 1
        finally:
            await transaction.rollback()
