"Типизированные контракты документов и хранилища без ORM-моделей для нижних слоёв приложения."

from collections.abc import AsyncIterable
from dataclasses import dataclass
from datetime import datetime
from typing import BinaryIO

from app.domain.documents.file_policy import FileMetadata


@dataclass(frozen=True, slots=True)
class UserSummary:
    id: str
    name: str
    username: str


@dataclass(frozen=True, slots=True)
class ProjectSummary:
    id: str
    code: str
    name: str


@dataclass(frozen=True, slots=True)
class EmployeeSummary:
    id: str
    code: str
    fullName: str


@dataclass(frozen=True, slots=True)
class AssetSummary:
    id: str
    inventoryNumber: str
    name: str


@dataclass(frozen=True, slots=True)
class VersionRecord:
    id: str
    documentId: str
    versionNumber: int
    originalFilename: str
    mimeType: str
    extension: str
    sizeBytes: int
    sha256: str
    comment: str | None
    uploadedById: str
    uploadedBy: UserSummary
    createdAt: datetime


@dataclass(frozen=True, slots=True)
class DocumentRecord:
    id: str
    title: str
    category: str
    status: str
    currentVersion: int
    lockVersion: int
    createdById: str
    createdAt: datetime
    updatedAt: datetime
    createdBy: UserSummary
    description: str | None = None
    projectId: str | None = None
    employeeId: str | None = None
    assetId: str | None = None
    archivedAt: datetime | None = None
    project: ProjectSummary | None = None
    employee: EmployeeSummary | None = None
    asset: AssetSummary | None = None
    versions: tuple[VersionRecord, ...] = ()


@dataclass(frozen=True, slots=True)
class DocumentPage:
    documents: tuple[DocumentRecord, ...]
    total: int


@dataclass(frozen=True, slots=True)
class DocumentFilter:
    page: int = 1
    pageSize: int = 25
    search: str | None = None
    status: str | None = None
    category: str | None = None
    projectId: str | None = None
    employeeId: str | None = None
    assetId: str | None = None
    archived: bool = False


@dataclass(frozen=True, slots=True)
class LinkTarget:
    project_id: str | None = None
    employee_id: str | None = None
    employee_department_id: str | None = None
    asset_project_id: str | None = None
    asset_department_ids: tuple[str, ...] = ()

    def permission_target(self) -> dict[str, object]:
        return {
            "documentProjectId": self.project_id,
            "documentEmployeeId": self.employee_id,
            "documentEmployeeDepartmentId": self.employee_department_id,
            "documentAssetProjectId": self.asset_project_id,
            "documentAssetDepartmentIds": self.asset_department_ids,
        }


@dataclass(frozen=True, slots=True)
class StoredObject:
    key: str
    size: int
    sha256: str


@dataclass(slots=True)
class StagedObject:
    stored: StoredObject
    lease: BinaryIO


@dataclass(frozen=True, slots=True)
class UploadStream:
    chunks: AsyncIterable[bytes]
    mime_type: str | None = None
    declared_size: int | None = None


@dataclass(frozen=True, slots=True)
class NewDocument:
    title: str
    category: str
    createdById: str
    description: str | None = None
    projectId: str | None = None
    employeeId: str | None = None
    assetId: str | None = None


@dataclass(frozen=True, slots=True)
class NewVersion:
    documentId: str
    versionNumber: int
    file: FileMetadata
    stored: StoredObject
    uploadedById: str
    comment: str | None = None


@dataclass(frozen=True, slots=True)
class DocumentChanges:
    lockVersion: int
    status: str | None = None
    currentVersion: int | None = None
    archivedAt: datetime | None = None


@dataclass(frozen=True, slots=True)
class DownloadMetadata:
    documentId: str
    versionNumber: int
    stored: StoredObject
    originalFilename: str
    mimeType: str


@dataclass(frozen=True, slots=True)
class DocumentOptions:
    projects: tuple[ProjectSummary, ...]
    employees: tuple[EmployeeSummary, ...]
    assets: tuple[AssetSummary, ...]


@dataclass(frozen=True, slots=True)
class RenderTemplate:
    template: str
    number: str
    date: datetime
    subject: str
    details: str
    basis: str | None = None
    format: str = "docx"
