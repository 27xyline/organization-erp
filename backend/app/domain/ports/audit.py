"""Audit records accepted by transactional use cases."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

type JsonValue = None | bool | int | float | str | list[JsonValue] | dict[str, JsonValue]


@dataclass(frozen=True, slots=True)
class AuditRecord:
    action: str
    entity_type: str
    entity_id: str
    user_id: str | None = None
    details: dict[str, JsonValue] | None = None
    request_id: str | None = None


class AuditPort(Protocol):
    async def append(self, record: AuditRecord) -> None: ...
