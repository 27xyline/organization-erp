"""Notification intents persisted transactionally for later delivery."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

from app.domain.ports.audit import JsonValue

NotificationEvent = Literal[
    "SYSTEM",
    "APPROVAL_REQUESTED",
    "APPROVAL_DECIDED",
    "CONTRACT_EXPIRING",
    "TASK_OVERDUE",
    "ASSET_DISPOSAL_DUE",
    "ASSET_MAINTENANCE_DUE",
    "BUDGET_OVERRUN",
]
NotificationChannel = Literal["IN_APP", "EMAIL"]


@dataclass(frozen=True, slots=True)
class NotificationIntent:
    user_id: str
    event_type: NotificationEvent
    channel: NotificationChannel
    title: str
    body: str
    dedupe_key: str
    payload: dict[str, JsonValue]
    target_url: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None


class NotificationIntentPort(Protocol):
    async def enqueue(self, intent: NotificationIntent) -> None: ...
