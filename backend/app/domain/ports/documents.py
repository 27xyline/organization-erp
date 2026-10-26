"Типизированные границы хранения документов, закрытого хранилища и формирования представлений."

from collections.abc import Awaitable, Callable
from typing import BinaryIO, Protocol

from app.domain.auth.rules import AccessContext
from app.domain.documents.records import (
    DocumentChanges,
    DocumentFilter,
    DocumentOptions,
    DocumentPage,
    DocumentRecord,
    DownloadMetadata,
    LinkTarget,
    NewDocument,
    NewVersion,
    RenderTemplate,
    StagedObject,
    StoredObject,
    UploadStream,
)


class DocumentMetadataPort(Protocol):
    async def get(
        self, document_id: str, access: AccessContext, permission: str, *, lock: bool = False
    ) -> DocumentRecord | None: ...


class DocumentRepository(DocumentMetadataPort, Protocol):
    async def list(self, query: DocumentFilter, access: AccessContext) -> DocumentPage: ...
    async def links(
        self, project: str | None, employee: str | None, asset: str | None
    ) -> LinkTarget: ...
    async def create(self, record: NewDocument) -> str: ...
    async def version(self, record: NewVersion) -> None: ...
    async def update(self, document_id: str, changes: DocumentChanges) -> None: ...
    async def download(
        self, document_id: str, number: int | None, access: AccessContext
    ) -> DownloadMetadata | None: ...
    async def options(self, access: AccessContext) -> DocumentOptions: ...
    async def referenced(self, key: str) -> bool:
        "Дождаться завершения предыдущих записей перед проверкой новой зафиксированной ссылки."
        ...


class StoragePort(Protocol):
    async def stage(self, upload: UploadStream, maximum: int) -> StagedObject: ...
    async def promote(self, staged: StagedObject) -> None: ...
    async def finish(self, staged: StagedObject) -> None: ...
    async def abandon(self, staged: StagedObject) -> None: ...
    async def get(self, stored: StoredObject) -> BinaryIO: ...
    async def delete(self, key: str) -> None: ...
    async def recover(self, referenced: Callable[[str], Awaitable[bool]]) -> int: ...


class RenderingPort(Protocol):
    async def render(self, template: RenderTemplate) -> bytes: ...
