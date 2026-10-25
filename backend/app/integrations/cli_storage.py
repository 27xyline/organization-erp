"""Адаптер проверки целостности файлов документов, используемый явной командой CLI verify-data."""

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
            # Старая команда verify-data одинаково обрабатывает отсутствующие,
            # недопустимые и повреждённые файлы.
            return False
        finally:
            if contents is not None:
                contents.close()
