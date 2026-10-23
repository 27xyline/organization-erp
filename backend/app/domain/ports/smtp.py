"""SMTP configuration records and boundaries for settings and delivery checks."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True, slots=True)
class SmtpSettingsRecord:
    host: str
    port: int
    username: str
    password: str
    secure: bool
    from_email: str


@dataclass(frozen=True, slots=True)
class SmtpCredentials:
    host: str
    port: int
    username: str
    password: str
    secure: bool
    from_email: str


class SmtpSettingsPort(Protocol):
    async def get(self) -> SmtpSettingsRecord | None: ...

    async def save(self, values: dict[str, Any]) -> SmtpSettingsRecord | None: ...


SmtpVerifier = Callable[[SmtpCredentials], bool]
