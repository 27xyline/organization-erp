"""Pure application document commands and results."""

from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime
from typing import BinaryIO

from app.domain.documents.records import (
    DocumentFilter,
    DocumentRecord,
    RenderTemplate,
    UploadStream,
)
from app.domain.documents.records import (
    DocumentPage as DocumentPage,
)
from app.domain.documents.records import (
    StagedObject as StagedObject,
)
from app.domain.documents.records import (
    StoredObject as StoredObject,
)

DocumentQuery = DocumentFilter
DocumentView = DocumentRecord
Upload = UploadStream


@dataclass(frozen=True, slots=True)
class DocumentCommand:
    title: str
    filename: str
    category: str = "GENERAL"
    description: str | None = None
    projectId: str | None = None
    employeeId: str | None = None
    assetId: str | None = None


@dataclass(frozen=True, slots=True)
class VersionCommand:
    filename: str
    lockVersion: int
    comment: str | None = None


@dataclass(frozen=True, slots=True)
class GenerateCommand:
    template: str
    title: str
    number: str
    date: datetime
    subject: str
    details: str
    basis: str | None = None
    projectId: str | None = None
    employeeId: str | None = None
    assetId: str | None = None
    format: str = "docx"

    def render_template(self) -> RenderTemplate:
        return RenderTemplate(
            self.template,
            self.number,
            self.date,
            self.subject,
            self.details,
            self.basis,
            self.format,
        )


@dataclass(slots=True)
class Download:
    file: BinaryIO
    size: int
    sha256: str
    filename: str
    mime_type: str

    def chunks(self) -> Iterator[bytes]:
        try:
            while chunk := self.file.read(65536):
                yield chunk
        finally:
            self.file.close()
