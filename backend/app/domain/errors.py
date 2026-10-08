from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class DomainError(Exception):
    code: str
    message: str
    status_code: int = 409
    details: Any | None = None

    def __str__(self) -> str:
        return self.message
