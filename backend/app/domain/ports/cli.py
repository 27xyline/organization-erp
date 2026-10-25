"Порты для явно вызываемых операционных сценариев CLI."

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class DocumentFileReference:
    storage_key: str
    size_bytes: int
    sha256: str


@dataclass(frozen=True, slots=True)
class VerifyDataSnapshot:
    counters: dict[str, int]
    document_files: tuple[DocumentFileReference, ...]


class DemoSeedPort(Protocol):
    async def seed_training_dataset(self) -> dict[str, int]: ...


class VerifyDataPort(Protocol):
    async def verify_data(self) -> VerifyDataSnapshot: ...


class DocumentFileVerificationPort(Protocol):
    async def verify(self, reference: DocumentFileReference) -> bool: ...
