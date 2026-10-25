"""Проекции глобального поиска с фильтрацией по разрешениям."""

from sqlalchemy import exists, false, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.domain.auth.rules import AccessContext
from app.models.assets import Asset
from app.models.documents import Document, DocumentVersion
from app.models.employees import Employee
from app.models.projects import Project, Task
from app.repositories.assets import visibility as asset_visibility
from app.repositories.documents import visibility as document_visibility

_PROJECT_STATUS_LABELS = {"ACTIVE": "Активный", "COMPLETED": "Завершен", "ARCHIVED": "Архив"}
_TASK_STATUS_LABELS = {
    "NOT_STARTED": "Не начата",
    "IN_PROGRESS": "В работе",
    "COMPLETED": "Завершена",
    "DELAYED": "Просрочена",
}
_DOCUMENT_STATUS_LABELS = {
    "DRAFT": "Черновик",
    "IN_REVIEW": "На согласовании",
    "APPROVED": "Согласован",
    "SIGNED": "Подписан",
    "ARCHIVED": "В архиве",
}


def _label(labels: dict[str, str], value: object) -> str:
    status = str(value)
    return labels.get(status, status)


def project_scope(access: AccessContext, permission: str) -> ColumnElement[bool]:
    predicates: list[ColumnElement[bool]] = []
    for grant in access.grants_for(permission):
        ids = access._ids(grant, "project")
        predicates.append(true() if ids is None else Project.id.in_(ids))
    return or_(*predicates) if predicates else false()


class SqlAlchemySearchRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def search(self, query: str, access: AccessContext) -> list[dict[str, str]]:
        term = f"%{query}%"
        results: list[dict[str, str]] = []

        if access.has("employees.read"):
            grants = access.grants_for("employees.read")
            employee_predicates: list[ColumnElement[bool]] = []
            for grant in grants:
                if grant.department_scope_mode == "ALL":
                    employee_predicates.append(true())
                elif grant.department_scope_mode == "SELF":
                    if access.employee_id:
                        employee_predicates.append(Employee.id == access.employee_id)
                elif grant.department_scope_mode == "ASSIGNED":
                    employee_predicates.append(Employee.departmentId.in_(grant.department_ids))
            employee_rows = (
                await self.session.execute(
                    select(Employee.id, Employee.code, Employee.fullName, Employee.department)
                    .where(
                        Employee.status != "DISMISSED",
                        or_(*employee_predicates) if employee_predicates else false(),
                    )
                    .where(
                        or_(
                            Employee.fullName.ilike(term),
                            Employee.code.ilike(term),
                            Employee.department.ilike(term),
                        )
                    )
                    .order_by(Employee.fullName)
                    .limit(5)
                )
            ).all()
            results.extend(
                {
                    "id": r.id,
                    "type": "employee",
                    "title": r.fullName,
                    "subtitle": f"Табельный № {r.code} · {r.department}",
                    "href": f"/employees/{r.id}",
                }
                for r in employee_rows
            )

        if access.has("assets.read"):
            asset_rows = (
                await self.session.execute(
                    select(Asset.id, Asset.name, Asset.inventoryNumber)
                    .where(Asset.isArchived.is_(False), asset_visibility(access, "assets.read"))
                    .where(
                        or_(
                            Asset.name.ilike(term),
                            Asset.inventoryNumber.ilike(term),
                            Asset.documentDetails.ilike(term),
                        )
                    )
                    .order_by(Asset.orderNumber.desc())
                    .limit(5)
                )
            ).all()
            results.extend(
                {
                    "id": r.id,
                    "type": "asset",
                    "title": r.name,
                    "subtitle": f"Инвентарный № {r.inventoryNumber}",
                    "href": f"/assets/{r.id}",
                }
                for r in asset_rows
            )

        if access.has("projects.read"):
            project_rows = (
                await self.session.execute(
                    select(Project.id, Project.code, Project.name, Project.status)
                    .where(project_scope(access, "projects.read"))
                    .where(
                        or_(
                            Project.code.ilike(term),
                            Project.name.ilike(term),
                            Project.description.ilike(term),
                        )
                    )
                    .order_by(Project.status, Project.createdAt.desc())
                    .limit(5)
                )
            ).all()
            results.extend(
                {
                    "id": r.id,
                    "type": "project",
                    "title": r.name,
                    "subtitle": f"{r.code} · {_label(_PROJECT_STATUS_LABELS, r.status)}",
                    "href": f"/projects/{r.id}",
                }
                for r in project_rows
            )

        if access.has("tasks.read"):
            task_rows = (
                await self.session.execute(
                    select(
                        Task.id,
                        Task.name.label("task_name"),
                        Task.projectId,
                        Project.code,
                        Project.name.label("project_name"),
                        Task.status,
                    )
                    .join(Project, Project.id == Task.projectId)
                    .where(project_scope(access, "tasks.read"))
                    .where(
                        or_(
                            Task.name.ilike(term),
                            Task.description.ilike(term),
                            Task.responsible.ilike(term),
                        )
                    )
                    .order_by(Task.updatedAt.desc())
                    .limit(5)
                )
            ).all()
            results.extend(
                {
                    "id": r.id,
                    "type": "task",
                    "title": r.task_name,
                    "subtitle": (
                        f"Задача · {r.code} {r.project_name} · "
                        f"{_label(_TASK_STATUS_LABELS, r.status)}"
                    ),
                    "href": f"/projects/{r.projectId}",
                }
                for r in task_rows
            )

        if access.has("documents.read"):
            document_rows = (
                await self.session.execute(
                    select(Document.id, Document.title, Document.status)
                    .where(
                        Document.archivedAt.is_(None), document_visibility(access, "documents.read")
                    )
                    .where(
                        or_(
                            Document.title.ilike(term),
                            Document.description.ilike(term),
                            exists(
                                select(DocumentVersion.id).where(
                                    DocumentVersion.documentId == Document.id,
                                    DocumentVersion.originalFilename.ilike(term),
                                )
                            ),
                        )
                    )
                    .order_by(Document.updatedAt.desc())
                    .limit(5)
                )
            ).all()
            results.extend(
                {
                    "id": r.id,
                    "type": "document",
                    "title": r.title,
                    "subtitle": f"Документ · {_label(_DOCUMENT_STATUS_LABELS, r.status)}",
                    "href": f"/documents/{r.id}",
                }
                for r in document_rows
            )

        return results
