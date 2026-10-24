"""Document-file integrity adapter used by the explicit verify-data CLI."""

from typing import BinaryIO

from app.domain.documents.records import StoredObject
from app.domain.ports.cli import DocumentFileReference
from app.domain.ports.documents import StoragePort


class LocalDocumentFileVerificationAdapter:
    def __init__(self, storage: StoragePort) -> None:
        self._storage = storage

    async def verify(self, reference: DocumentFileReference) -> bool:
        contents: BinaryIO | None = None
        try:
            contents = await self._storage.get(
                StoredObject(reference.storage_key, reference.size_bytes, reference.sha256)
            )
            return True
        except Exception:
            # Legacy verify-data treats missing, invalid, and corrupt files alike.
            return False
        finally:
            if contents is not None:
                contents.close()
