"Намерения отправить уведомления сохраняются транзакционно для последующей доставки."

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


@dataclass(frozen=True, slots=True)
class NotificationDeliveryPlan:
    active_user_ids: tuple[str, ...]
    deliveries: tuple[tuple[str, str], ...]


@dataclass(frozen=True, slots=True)
class NotificationProduceResult:
    created: int
    email_queued: int


class NotificationIntentPort(Protocol):
    async def deliveries(
        self, user_ids: tuple[str, ...], event_type: str
    ) -> NotificationDeliveryPlan: ...
    async def enqueue(self, intent: NotificationIntent) -> NotificationProduceResult: ...
    async def list_for_user(
        self, user_id: str, page: int, page_size: int, unread_only: bool
    ) -> tuple[list[dict[str, object]], int]: ...
    async def unread_count(self, user_id: str) -> int: ...
    async def set_read(self, user_id: str, notification_id: str, read: bool) -> bool: ...
    async def mark_all_read(self, user_id: str) -> int: ...
    async def delete_for_user(self, user_id: str, notification_id: str) -> bool: ...
    async def preferences(self, user_id: str) -> list[dict[str, object]]: ...
    async def set_preference(
        self, user_id: str, event_type: str, channel: str, enabled: bool
    ) -> None: ...
