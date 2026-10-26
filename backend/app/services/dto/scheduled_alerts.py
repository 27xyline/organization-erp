"Результат генерации запланированных уведомлений, не зависящий от фреймворка."

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class AlertResult:
    ran: bool
    generated: int = 0
    email_queued: int = 0
    sources: dict[str, int] | None = None
