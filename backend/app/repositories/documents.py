"""Ограниченные запросы документов с предварительной загрузкой и примитивы изменения; \
фиксация транзакции не выполняется."""

from collections.abc import Callable
from dataclasses import asdict
from typing import Any

from sqlalchemy import and_, exists, false, func, or_, select, text, true, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.domain.auth.rules import AccessContext
from app.domain.documents.records import (
    AssetSummary,
    DocumentChanges,
    DocumentFilter,
    DocumentOptions,
    DocumentPage,
    DocumentRecord,
    DownloadMetadata,
    EmployeeSummary,
    LinkTarget,
    NewDocument,
    NewVersion,
    ProjectSummary,
    StoredObject,
    UserSummary,
    VersionRecord,
)
from app.domain.errors import DomainError
from app.models.assets import Asset, AssetHolding
from app.models.catalogs import Mol
from app.models.documents import Document, DocumentVersion
from app.models.employees import Employee
from app.models.projects import Project
from app.repositories.assets import visibility as asset_visibility


def visibility(access: AccessContext, permission: str) -> Any:
    grants = []
    for grant in access.grants_for(permission):
        departments = access._ids(grant, "department")
        projects = access._ids(grant, "project")
        employee = (
            Document.employeeId == access.employee_id
            if grant.department_scope_mode == "SELF"
            else exists(
                select(Employee.id).where(
                    Employee.id == Document.employeeId,
                    true() if departments is None else Employee.departmentId.in_(departments),
                )
            )
        )
        project = (
            Document.projectId.is_not(None)
            if projects is None
            else Document.projectId.in_(projects)
        )
        asset_depts = exists(
            select(Asset.id)
            .join(Mol, Mol.id == Asset.molId)
            .where(
                Asset.id == Document.assetId,
                true() if departments is None else Mol.departmentId.in_(departments),
            )
        )
        holding = exists(
            select(AssetHolding.id)
            .join(Mol, Mol.id == AssetHolding.molId)
            .where(
                AssetHolding.assetId == Document.assetId,
                AssetHolding.quantity > 0,
                true() if departments is None else Mol.departmentId.in_(departments),
            )
        )
        asset_project = exists(
            select(Asset.id).where(
                Asset.id == Document.assetId,
                Asset.projectId.is_not(None) if projects is None else Asset.projectId.in_(projects),
            )
        )
        linked = or_(
            Document.employeeId.is_not(None),
            Document.projectId.is_not(None),
            Document.assetId.is_not(None),
        )
        full = grant.role in ("ADMIN", "AUDITOR") and departments is None and projects is None
        grants.append(
            and_(
                or_(Document.employeeId.is_(None), employee),
                or_(Document.projectId.is_(None), project),
                or_(Document.assetId.is_(None), asset_depts, holding, asset_project),
                true() if full else linked,
            )
        )
    return or_(*grants) if grants else false()


class SqlAlchemyDocumentRepository:
    def __init__(self, session: Callable[[], AsyncSession]) -> None:
        self._session = session

    async def _views(
        self, rows: list[Document], *, latest: bool = False
    ) -> tuple[DocumentRecord, ...]:
        ids = [row.id for row in rows]
        versions: dict[str, list[VersionRecord]] = {identifier: [] for identifier in ids}
        if ids:
            query = (
                select(DocumentVersion)
                .options(joinedload(DocumentVersion.uploadedBy))
                .where(DocumentVersion.documentId.in_(ids))
            )
            if latest:
                ranked = (
                    select(
                        DocumentVersion.id,
                        func.row_number()
                        .over(
                            partition_by=DocumentVersion.documentId,
                            order_by=DocumentVersion.versionNumber.desc(),
                        )
                        .label("rank"),
                    )
                    .where(DocumentVersion.documentId.in_(ids))
                    .subquery()
                )
                query = query.where(
                    DocumentVersion.id.in_(select(ranked.c.id).where(ranked.c.rank == 1))
                )
            for version in (
                await self._session().scalars(query.order_by(DocumentVersion.versionNumber.desc()))
            ).unique():
                versions[version.documentId].append(
                    VersionRecord(
                        version.id,
                        version.documentId,
                        version.versionNumber,
                        version.originalFilename,
                        version.mimeType,
                        version.extension,
                        version.sizeBytes,
                        version.sha256,
                        version.comment,
                        version.uploadedById,
                        UserSummary(
                            version.uploadedBy.id,
                            version.uploadedBy.name,
                            version.uploadedBy.username,
                        ),
                        version.createdAt,
                    )
                )
        result = []
        for row in rows:
            result.append(
                DocumentRecord(
                    id=row.id,
                    title=row.title,
                    description=row.description,
                    category=row.category,
                    status=row.status,
                    currentVersion=row.currentVersion,
                    lockVersion=row.lockVersion,
                    projectId=row.projectId,
                    employeeId=row.employeeId,
                    assetId=row.assetId,
                    createdById=row.createdById,
                    archivedAt=row.archivedAt,
                    createdAt=row.createdAt,
                    updatedAt=row.updatedAt,
                    createdBy=UserSummary(
                        row.createdBy.id, row.createdBy.name, row.createdBy.username
                    ),
                    project=ProjectSummary(row.project.id, row.project.code, row.project.name)
                    if row.project
                    else None,
                    employee=EmployeeSummary(
                        row.employee.id, row.employee.code, row.employee.fullName
                    )
                    if row.employee
                    else None,
                    asset=AssetSummary(row.asset.id, row.asset.inventoryNumber, row.asset.name)
                    if row.asset
                    else None,
                    versions=tuple(versions[row.id]),
                )
            )
        return tuple(result)

    def _query(self) -> Any:
        return select(Document).options(
            joinedload(Document.project),
            joinedload(Document.employee),
            joinedload(Document.asset),
            joinedload(Document.createdBy),
        )

    async def get(
        self, document_id: str, access: AccessContext, permission: str, *, lock: bool = False
    ) -> DocumentRecord | None:
        if lock:
            await self._session().execute(
                text("SELECT pg_advisory_xact_lock(hashtextextended(:id, 0))"), {"id": document_id}
            )
            # Блокировка строки также упорядочивает работу с переходной записью
            # согласований на TS.
            await self._session().execute(
                select(Document.id).where(Document.id == document_id).with_for_update()
            )
        row = await self._session().scalar(
            self._query()
            .where(Document.id == document_id, visibility(access, permission))
            .execution_options(populate_existing=True)
        )
        return (await self._views([row]))[0] if row is not None else None

    async def list(self, query: DocumentFilter, access: AccessContext) -> DocumentPage:
        clauses = [
            visibility(access, "documents.read"),
            Document.status == "ARCHIVED" if query.archived else Document.status != "ARCHIVED",
        ]
        for field in ("status", "category", "projectId", "employeeId", "assetId"):
            if value := getattr(query, field):
                clauses.append(getattr(Document, field) == value)
        if query.search:
            pattern = (
                "%"
                + query.search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                + "%"
            )
            clauses.append(
                or_(
                    Document.title.ilike(pattern),
                    Document.description.ilike(pattern),
                    exists(
                        select(DocumentVersion.id).where(
                            DocumentVersion.documentId == Document.id,
                            DocumentVersion.originalFilename.ilike(pattern),
                        )
                    ),
                )
            )
        count = await self._session().scalar(
            select(func.count()).select_from(Document).where(*clauses)
        )
        rows = list(
            (
                await self._session().scalars(
                    self._query()
                    .where(*clauses)
                    .order_by(Document.updatedAt.desc(), Document.id.desc())
                    .offset((query.page - 1) * query.pageSize)
                    .limit(query.pageSize)
                )
            ).unique()
        )
        return DocumentPage(await self._views(rows, latest=True), count or 0)

    async def links(
        self, project: str | None, employee: str | None, asset: str | None
    ) -> LinkTarget:
        employee_department: str | None = None
        asset_project: str | None = None
        asset_departments: tuple[str, ...] = ()
        if project:
            if not await self._session().scalar(select(Project.id).where(Project.id == project)):
                raise DomainError(
                    "LINK_NOT_FOUND",
                    "Связанный проект, сотрудник или объект имущества не найден",
                    422,
                )
        if employee:
            row = await self._session().scalar(select(Employee).where(Employee.id == employee))
            if row is None:
                raise DomainError(
                    "LINK_NOT_FOUND",
                    "Связанный проект, сотрудник или объект имущества не найден",
                    422,
                )
            employee_department = row.departmentId
        if asset:
            row_asset = await self._session().scalar(select(Asset).where(Asset.id == asset))
            if row_asset is None:
                raise DomainError(
                    "LINK_NOT_FOUND",
                    "Связанный проект, сотрудник или объект имущества не найден",
                    422,
                )
            depts = list(
                (
                    await self._session().scalars(
                        select(Mol.departmentId).where(
                            or_(
                                Mol.id == row_asset.molId,
                                Mol.id.in_(
                                    select(AssetHolding.molId).where(
                                        AssetHolding.assetId == asset, AssetHolding.quantity > 0
                                    )
                                ),
                            )
                        )
                    )
                ).all()
            )
            asset_project = row_asset.projectId
            asset_departments = tuple(depts)
        return LinkTarget(project, employee, employee_department, asset_project, asset_departments)

    async def create(self, record: NewDocument) -> str:
        row = Document(**asdict(record))
        self._session().add(row)
        await self._session().flush()
        return row.id

    async def _storage_fence(self, key: str) -> None:
        await self._session().execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
            {"key": "document-storage:" + key},
        )

    async def version(self, record: NewVersion) -> None:
        await self._storage_fence(record.stored.key)
        self._session().add(
            DocumentVersion(
                documentId=record.documentId,
                versionNumber=record.versionNumber,
                storageKey=record.stored.key,
                originalFilename=record.file.filename,
                mimeType=record.file.mime_type,
                extension=record.file.extension,
                sizeBytes=record.stored.size,
                sha256=record.stored.sha256,
                uploadedById=record.uploadedById,
                comment=record.comment,
            )
        )
        await self._session().flush()

    async def update(self, document_id: str, changes: DocumentChanges) -> None:
        values = {key: value for key, value in asdict(changes).items() if value is not None}
        await self._session().execute(
            update(Document).where(Document.id == document_id).values(**values)
        )
        await self._session().flush()

    async def download(
        self, document_id: str, number: int | None, access: AccessContext
    ) -> DownloadMetadata | None:
        query = (
            select(DocumentVersion)
            .join(Document, Document.id == DocumentVersion.documentId)
            .where(Document.id == document_id, visibility(access, "documents.download"))
        )
        if number is not None:
            query = query.where(DocumentVersion.versionNumber == number)
        row = await self._session().scalar(
            query.order_by(DocumentVersion.versionNumber.desc()).limit(1)
        )
        return (
            DownloadMetadata(
                row.documentId,
                row.versionNumber,
                StoredObject(row.storageKey, row.sizeBytes, row.sha256),
                row.originalFilename,
                row.mimeType,
            )
            if row
            else None
        )

    async def referenced(self, key: str) -> bool:
        # Раздельные команды нужны намеренно. READ COMMITTED создаёт новый снимок
        # только после снятия транзакционного барьера блокировки писателя.
        isolation = await self._session().scalar(text("SHOW transaction_isolation"))
        if isolation != "read committed":
            raise RuntimeError("Document reconciliation requires READ COMMITTED")
        await self._storage_fence(key)
        return bool(
            await self._session().scalar(select(exists().where(DocumentVersion.storageKey == key)))
        )

    async def options(self, access: AccessContext) -> DocumentOptions:
        projects = access.allowed_project_ids("documents.create")
        project_rows = (
            await self._session().scalars(
                select(Project)
                .where(
                    Project.status != "ARCHIVED",
                    true() if projects is None else Project.id.in_(projects),
                )
                .order_by(Project.name)
                .limit(200)
            )
        ).all()
        employee_clauses = [
            true()
            if grant.department_scope_mode == "ALL"
            else Employee.id == access.employee_id
            if grant.department_scope_mode == "SELF"
            else Employee.departmentId.in_(grant.department_ids)
            for grant in access.grants_for("documents.create")
            if grant.department_scope_mode != "NONE"
        ]
        employee_scope = or_(*employee_clauses) if employee_clauses else false()
        employee_rows = (
            await self._session().scalars(
                select(Employee)
                .where(
                    Employee.status != "DISMISSED",
                    employee_scope,
                )
                .order_by(Employee.fullName)
                .limit(500)
            )
        ).all()
        assets = (
            await self._session().scalars(
                select(Asset)
                .where(Asset.isArchived.is_(False), asset_visibility(access, "documents.create"))
                .order_by(Asset.name)
                .limit(500)
            )
        ).all()
        return DocumentOptions(
            tuple(ProjectSummary(r.id, r.code, r.name) for r in project_rows),
            tuple(EmployeeSummary(r.id, r.code, r.fullName) for r in employee_rows),
            tuple(AssetSummary(r.id, r.inventoryNumber, r.name) for r in assets),
        )
