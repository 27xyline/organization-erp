from datetime import datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.auth.rules import AccessContext, ScopeGrant
from app.models.assets import Asset
from app.models.catalogs import AssetGroup, Mol
from app.models.departments import Department
from app.models.documents import Document
from app.models.employees import Employee
from app.models.projects import Project, Task
from app.models.users import User
from app.services.search import SearchService


@pytest.mark.anyio
async def test_search_hides_scoped_employee_asset_project_task_and_document_fields(
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
                    AssetGroup(id="s12-hidden-group", code="S12-HG", name="Hidden group"),
                    Mol(
                        id="s12-hidden-mol",
                        code="S12-HM",
                        department="Hidden Unit",
                        departmentId="s12-hidden-dept",
                        fullName="Hidden custodian",
                        storageLocation="Hidden store",
                    ),
                    Project(
                        id="s12-hidden-project",
                        code="S12-HP",
                        name="Secret Search Person project",
                        description="Secret Search Person project description",
                    ),
                    User(
                        id="s12-document-author",
                        username="s12-doc-author",
                        name="Stage12 author",
                        passwordHash="not-a-real-hash",
                    ),
                ]
            )
            await session.flush()
            session.add_all(
                [
                    Asset(
                        id="s12-hidden-asset",
                        name="Secret Search Person asset",
                        inventoryNumber="S12-HIDDEN-ASSET",
                        unitPrice=100,
                        unitOfMeasure="шт",
                        quantity=1,
                        totalCost=100,
                        molId="s12-hidden-mol",
                        groupId="s12-hidden-group",
                        recordingDate=datetime(2026, 1, 1),
                        documentType="Акт",
                        documentDetails="Secret Search Person asset details",
                    ),
                    Task(
                        id="s12-hidden-task",
                        projectId="s12-hidden-project",
                        name="Secret Search Person task",
                        description="Secret Search Person task description",
                    ),
                    Document(
                        id="s12-hidden-document",
                        title="Secret Search Person document",
                        description="Secret Search Person document description",
                        employeeId="s12-hidden-employee",
                        createdById="s12-document-author",
                    ),
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
                    ScopeGrant(
                        assignment_id="s12-asset-grant",
                        role="ASSET_CUSTODIAN",
                        department_scope_mode="ASSIGNED",
                        project_scope_mode="NONE",
                        department_ids=("s12-visible-dept",),
                    ),
                    ScopeGrant(
                        assignment_id="s12-project-grant",
                        role="PROJECT_MANAGER",
                        department_scope_mode="NONE",
                        project_scope_mode="ASSIGNED",
                        project_ids=("s12-visible-project",),
                    ),
                ),
            )

            items = await SearchService(session).search("Secret Search Person", access)

            assert [item["id"] for item in items] == ["s12-visible-employee"]
            forbidden = (
                "s12-hidden-employee",
                "s12-hidden-asset",
                "s12-hidden-project",
                "s12-hidden-task",
                "s12-hidden-document",
                "Secret Search Person asset",
                "Secret Search Person project",
                "Secret Search Person task",
                "Secret Search Person document",
            )
            assert not any(secret in str(items) for secret in forbidden)
        finally:
            await transaction.rollback()
