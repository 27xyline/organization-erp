from collections.abc import Callable
from typing import Any, cast

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import new_cuid
from app.domain.ports.notifications import (
    NotificationDeliveryPlan,
    NotificationIntent,
    NotificationProduceResult,
)
from app.models.enums import NotificationChannel, NotificationEventType
from app.models.notifications import Notification, NotificationOutbox, NotificationPreference
from app.models.users import User


class SqlAlchemyNotificationRepository:
    def __init__(self, session: Callable[[], AsyncSession]) -> None:
        self._session = session

    async def deliveries(
        self, user_ids: tuple[str, ...], event_type: str
    ) -> NotificationDeliveryPlan:
        session = self._session()
        active = (
            await session.scalars(
                select(User.id)
                .where(User.id.in_(user_ids), User.isActive.is_(True))
                .order_by(User.id)
            )
        ).all()
        preferences = (
            await session.execute(
                select(
                    NotificationPreference.userId,
                    NotificationPreference.channel,
                    NotificationPreference.enabled,
                ).where(
                    NotificationPreference.userId.in_(active),
                    NotificationPreference.eventType == NotificationEventType(event_type),
                )
            )
        ).all()
        enabled = {(row.userId, row.channel.value): row.enabled for row in preferences}
        return NotificationDeliveryPlan(
            tuple(active),
            tuple(
                (user_id, channel)
                for user_id in active
                for channel in ("IN_APP", "EMAIL")
                if enabled.get((user_id, channel), channel == "IN_APP")
            ),
        )

    async def list_for_user(
        self, user_id: str, page: int, page_size: int, unread_only: bool
    ) -> tuple[list[dict[str, object]], int]:
        session = self._session()
        where = [
            Notification.userId == user_id,
            Notification.channel == NotificationChannel.IN_APP,
            Notification.deletedAt.is_(None),
        ]
        if unread_only:
            where.append(Notification.readAt.is_(None))
        total = int(
            await session.scalar(select(func.count()).select_from(Notification).where(*where)) or 0
        )
        rows = (
            await session.scalars(
                select(Notification)
                .where(*where)
                .order_by(Notification.createdAt.desc(), Notification.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        ).all()
        return (
            [
                {
                    "id": row.id,
                    "eventType": row.eventType.value,
                    "title": row.title,
                    "body": row.body,
                    "targetUrl": row.targetUrl,
                    "entityType": row.entityType,
                    "entityId": row.entityId,
                    "readAt": row.readAt,
                    "createdAt": row.createdAt,
                }
                for row in rows
            ],
            total,
        )

    async def unread_count(self, user_id: str) -> int:
        return int(
            await self._session().scalar(
                select(func.count())
                .select_from(Notification)
                .where(
                    Notification.userId == user_id,
                    Notification.channel == NotificationChannel.IN_APP,
                    Notification.deletedAt.is_(None),
                    Notification.readAt.is_(None),
                )
            )
            or 0
        )

    async def set_read(self, user_id: str, notification_id: str, read: bool) -> bool:
        result = await self._session().execute(
            update(Notification)
            .where(
                Notification.id == notification_id,
                Notification.userId == user_id,
                Notification.channel == NotificationChannel.IN_APP,
                Notification.deletedAt.is_(None),
            )
            .values(readAt=func.current_timestamp() if read else None)
        )
        return bool(cast(CursorResult[Any], result).rowcount)

    async def mark_all_read(self, user_id: str) -> int:
        result = await self._session().execute(
            update(Notification)
            .where(
                Notification.userId == user_id,
                Notification.channel == NotificationChannel.IN_APP,
                Notification.deletedAt.is_(None),
                Notification.readAt.is_(None),
            )
            .values(readAt=func.current_timestamp())
        )
        return int(cast(CursorResult[Any], result).rowcount or 0)

    async def delete_for_user(self, user_id: str, notification_id: str) -> bool:
        result = await self._session().execute(
            update(Notification)
            .where(
                Notification.id == notification_id,
                Notification.userId == user_id,
                Notification.channel == NotificationChannel.IN_APP,
                Notification.deletedAt.is_(None),
            )
            .values(deletedAt=func.current_timestamp())
        )
        return bool(cast(CursorResult[Any], result).rowcount)

    async def preferences(self, user_id: str) -> list[dict[str, object]]:
        rows = (
            await self._session().scalars(
                select(NotificationPreference).where(NotificationPreference.userId == user_id)
            )
        ).all()
        return [
            {"eventType": row.eventType.value, "channel": row.channel.value, "enabled": row.enabled}
            for row in rows
        ]

    async def set_preference(
        self, user_id: str, event_type: str, channel: str, enabled: bool
    ) -> None:
        await self._session().execute(
            insert(NotificationPreference)
            .values(
                id=new_cuid(),
                userId=user_id,
                eventType=NotificationEventType(event_type),
                channel=NotificationChannel(channel),
                enabled=enabled,
            )
            .on_conflict_do_update(
                index_elements=[
                    "userId",
                    "eventType",
                    "channel",
                ],
                set_={"enabled": enabled, "updatedAt": func.current_timestamp()},
            )
        )

    async def enqueue(self, intent: NotificationIntent) -> NotificationProduceResult:
        session = self._session()
        result = await session.scalar(
            insert(Notification)
            .values(
                id=new_cuid(),
                userId=intent.user_id,
                eventType=NotificationEventType(intent.event_type),
                channel=NotificationChannel(intent.channel),
                title=intent.title,
                body=intent.body,
                targetUrl=intent.target_url,
                entityType=intent.entity_type,
                entityId=intent.entity_id,
                dedupeKey=intent.dedupe_key,
            )
            .on_conflict_do_nothing(index_elements=["userId", "dedupeKey", "channel"])
            .returning(Notification.id)
        )
        email_queued = 0
        if intent.channel == "EMAIL":
            notification_id = result or await session.scalar(
                select(Notification.id).where(
                    Notification.userId == intent.user_id,
                    Notification.dedupeKey == intent.dedupe_key,
                    Notification.channel == NotificationChannel.EMAIL,
                )
            )
            if notification_id:
                stored = await session.get(Notification, notification_id)
                assert stored is not None
                payload = {
                    "eventType": stored.eventType.value,
                    "title": stored.title,
                    "body": stored.body,
                    "targetUrl": stored.targetUrl,
                }
                queued = await session.scalar(
                    insert(NotificationOutbox)
                    .values(
                        id=new_cuid(),
                        notificationId=notification_id,
                        userId=intent.user_id,
                        payload=payload,
                    )
                    .on_conflict_do_nothing(index_elements=["notificationId"])
                    .returning(NotificationOutbox.id)
                )
                email_queued = int(queued is not None)
        return NotificationProduceResult(int(result is not None), email_queued)
