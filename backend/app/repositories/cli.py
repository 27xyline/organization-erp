"""SQLAlchemy adapters for explicit demo-seed and verification CLI ports."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, cast

from sqlalchemy import String, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.departments import Department
from app.models.employees import Employee
from app.models.projects import Project, ProjectMember, Task, TaskAssignee
from app.models.timekeeping import StaffSchedule

DEMO_DEPARTMENT_CODE = "DEMO"
DEMO_EMPLOYEE_ID = "demo_seed_employee_0001"
DEMO_PROJECT_ID = "demo_seed_project_0001"
DEMO_TASK_ID = "demo_seed_task_0001"
DEMO_PROJECT_MEMBER_ID = "demo_seed_project_member_0001"


def idempotent_insert_statement(model: Any, values: dict[str, Any]) -> Any:
    return pg_insert(model).values(**values).on_conflict_do_nothing()


def demo_training_links(
    department_id: str, schedule_id: str, employee_id: str, project_id: str, project_member_id: str
) -> dict[str, dict[str, str]]:
    return {
        "staffSchedule": {"departmentId": department_id},
        "employee": {"departmentId": department_id, "staffScheduleId": schedule_id},
        "projectMember": {"projectId": project_id, "employeeId": employee_id},
        "task": {"projectId": project_id},
        "taskAssignee": {
            "taskId": DEMO_TASK_ID,
            "employeeId": employee_id,
            "projectMemberId": project_member_id,
        },
    }


class SqlAlchemyDemoSeedRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def seed_training_dataset(self) -> dict[str, int]:
        # Transaction-scoped lock serializes concurrent explicit CLI invocations.
        from sqlalchemy import text

        await self._session.execute(text("SELECT pg_advisory_xact_lock(904202607)"))
        counts: dict[str, int] = {}

        counts["departmentsCreated"] = await self._insert(
            Department,
            {
                "id": "demo_seed_department_0001",
                "code": DEMO_DEPARTMENT_CODE,
                "name": "Учебное подразделение",
                "isActive": True,
            },
        )
        department_id = await self._session.scalar(
            select(Department.id).where(Department.code == DEMO_DEPARTMENT_CODE)
        )
        if department_id is None:
            raise RuntimeError("Не удалось получить учебное подразделение")

        schedule_id = "demo_seed_staff_schedule_0001"
        employee_id = DEMO_EMPLOYEE_ID
        project_id = DEMO_PROJECT_ID
        project_member_id = DEMO_PROJECT_MEMBER_ID
        links = demo_training_links(
            department_id, schedule_id, employee_id, project_id, project_member_id
        )
        counts["staffSchedulesCreated"] = await self._insert(
            StaffSchedule,
            {
                "id": schedule_id,
                "position": "Ведущий специалист",
                "department": "Учебное подразделение",
                **links["staffSchedule"],
                "rate": Decimal("1.00"),
                "salary": Decimal("120000.00"),
            },
        )
        counts["employeesCreated"] = await self._insert(
            Employee,
            {
                "id": DEMO_EMPLOYEE_ID,
                "code": "DEMO-EMP-001",
                "fullName": "Иванов Иван Иванович",
                "department": "Учебное подразделение",
                **links["employee"],
                "employmentRate": Decimal("1.00"),
            },
        )
        existing_employee_id = await self._session.scalar(
            select(Employee.id).where(Employee.code == "DEMO-EMP-001")
        )
        if existing_employee_id is None:
            raise RuntimeError("Не удалось получить учебного сотрудника")
        counts["projectsCreated"] = await self._insert(
            Project,
            {
                "id": DEMO_PROJECT_ID,
                "code": "DEMO-PRJ-001",
                "name": "Учебное внедрение ERP",
                "description": "Демо-проект для знакомства с участниками и задачами.",
                "startDate": datetime(2026, 1, 1),
                "endDate": datetime(2026, 12, 31),
                "plannedBudget": Decimal("500000.00"),
                "actualBudget": Decimal("180000.00"),
            },
        )
        existing_project_id = await self._session.scalar(
            select(Project.id).where(Project.code == "DEMO-PRJ-001")
        )
        if existing_project_id is None:
            raise RuntimeError("Не удалось получить учебный проект")
        project_member_id = DEMO_PROJECT_MEMBER_ID
        links = demo_training_links(
            department_id,
            schedule_id,
            existing_employee_id,
            existing_project_id,
            project_member_id,
        )
        counts["projectMembersCreated"] = await self._insert(
            ProjectMember,
            {
                "id": DEMO_PROJECT_MEMBER_ID,
                **links["projectMember"],
                "department": "Учебное подразделение",
                "position": "Ведущий специалист",
                "rate": Decimal("0.50"),
                "salary": Decimal("60000.00"),
            },
        )
        existing_project_member_id = await self._session.scalar(
            select(ProjectMember.id).where(
                ProjectMember.projectId == existing_project_id,
                ProjectMember.employeeId == existing_employee_id,
            )
        )
        if existing_project_member_id is None:
            raise RuntimeError("Не удалось получить участника учебного проекта")
        counts["tasksCreated"] = await self._insert(
            Task,
            {
                "id": DEMO_TASK_ID,
                **links["task"],
                "name": "Подготовить учебное окружение",
                "description": "Проверить связанные подразделение, сотрудника и проект.",
                "startDate": datetime(2026, 5, 1),
                "endDate": datetime(2026, 6, 30),
                "progress": 50,
                "status": "IN_PROGRESS",
            },
        )
        counts["taskAssigneesCreated"] = await self._insert(
            TaskAssignee,
            {
                "id": "demo_seed_task_assignee_0001",
                **demo_training_links(
                    department_id,
                    schedule_id,
                    existing_employee_id,
                    existing_project_id,
                    existing_project_member_id,
                )["taskAssignee"],
            },
        )
        counts["trainingRecordsCreated"] = sum(counts.values())
        return counts

    async def _insert(self, model: Any, values: dict[str, Any]) -> int:
        result = await self._session.execute(idempotent_insert_statement(model, values))
        return int(cast(CursorResult[Any], result).rowcount or 0)


class SqlAlchemyVerifyDataRepository:
    """Read-only SQL checks; the application service knows no ORM or SQL details."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def verify_data(self) -> dict[str, int]:
        from app.models.assets import Asset, AssetHolding
        from app.models.documents import Document, DocumentVersion
        from app.models.users import AuditLog

        holding_totals = (
            select(AssetHolding.assetId, func.sum(AssetHolding.quantity).label("qty"))
            .group_by(AssetHolding.assetId)
            .subquery()
        )
        holding_mismatch = await self._session.scalar(
            select(func.count())
            .select_from(Asset)
            .outerjoin(holding_totals, holding_totals.c.assetId == Asset.id)
            .where(func.coalesce(holding_totals.c.qty, 0) != Asset.quantity)
        )
        orphan_holdings = await self._session.scalar(
            select(func.count())
            .select_from(AssetHolding)
            .outerjoin(Asset, Asset.id == AssetHolding.assetId)
            .where(Asset.id.is_(None))
        )
        doc_mismatch = await self._session.scalar(
            select(func.count())
            .select_from(Document)
            .outerjoin(
                DocumentVersion,
                (DocumentVersion.documentId == Document.id)
                & (DocumentVersion.versionNumber == Document.currentVersion),
            )
            .where(DocumentVersion.id.is_(None))
        )
        negative_assets = await self._session.scalar(
            select(func.count())
            .select_from(Asset)
            .where((Asset.quantity < 0) | (Asset.unitPrice < 0) | (Asset.totalCost < 0))
        )
        negative_holdings = await self._session.scalar(
            select(func.count()).select_from(AssetHolding).where(AssetHolding.quantity < 0)
        )
        secret_audit = await self._session.scalar(
            select(func.count())
            .select_from(AuditLog)
            .where(func.coalesce(AuditLog.details.cast(String), "").ilike("%temporaryPassword%"))
        )
        return {
            "holdingMismatch": int(holding_mismatch or 0),
            "orphanHoldings": int(orphan_holdings or 0),
            "documentCurrentVersionMismatch": int(doc_mismatch or 0),
            "negativeAssets": int(negative_assets or 0),
            "negativeHoldings": int(negative_holdings or 0),
            "secretAuditRows": int(secret_audit or 0),
        }
