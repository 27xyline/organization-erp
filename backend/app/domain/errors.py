from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class DomainError(Exception):
    code: str
    message: str
    status_code: int = 409
    details: Any | None = None

    def __str__(self) -> str:
        return self.message


@dataclass(slots=True)
class PersistenceConflict(Exception):
    """A constraint conflict translated by the persistence adapter."""

    constraint: str

    def __str__(self) -> str:
        return self.constraint


class RetryableTransactionError(Exception):
    """Persistence reports PostgreSQL serialization or deadlock; transaction rolled back."""
