import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.auth.rules import AccessContext, ScopeGrant
from app.models.departments import Department
from app.models.employees import Employee
from app.services.search import SearchService


@pytest.mark.anyio
async def test_search_never_returns_employee_identity_outside_granted_department(
    stage11_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with stage11_session_factory() as session:
        transaction = await session.begin()
        try:
            session.add_all(
                [
                    Department(id="s12-visible-dept", code="S12-V", name="Stage12 visible"),
                    Department(id="s12-hidden-dept", code="S12-H", name="Stage12 hidden"),
                ]
            )
            await session.flush()
            session.add_all(
                [
                    Employee(
                        id="s12-visible-employee",
                        code="S12-V-1",
                        fullName="Secret Search Person",
                        department="Visible Unit",
                        departmentId="s12-visible-dept",
                    ),
                    Employee(
                        id="s12-hidden-employee",
                        code="S12-H-1",
                        fullName="Secret Search Person",
                        department="Hidden Unit",
                        departmentId="s12-hidden-dept",
                    ),
                ]
            )
            await session.flush()
            access = AccessContext(
                user_id="s12-user",
                employee_id=None,
                employee_department_id=None,
                member_project_ids=(),
                grants=(
                    ScopeGrant(
                        assignment_id="s12-grant",
                        role="HR",
                        department_scope_mode="ASSIGNED",
                        project_scope_mode="NONE",
                        department_ids=("s12-visible-dept",),
                    ),
                ),
            )

            items = await SearchService(session).search("Secret Search Person", access)

            assert [item["id"] for item in items] == ["s12-visible-employee"]
            assert all("s12-hidden-employee" not in str(item) for item in items)
        finally:
            await transaction.rollback()
