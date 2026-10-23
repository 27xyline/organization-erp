from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class NotificationQuery:
    page: int = 1
    pageSize: int = 20
    unreadOnly: bool = False


@dataclass(frozen=True, slots=True)
class NotificationPreferenceCommand:
    eventType: str
    channel: str
    enabled: bool
