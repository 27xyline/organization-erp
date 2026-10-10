from collections.abc import Callable

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
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
