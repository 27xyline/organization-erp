from dataclasses import replace
from typing import cast

from app.domain.ports.audit import AuditRecord
from app.domain.ports.notifications import NotificationChannel, NotificationIntent
from app.domain.ports.uow import UnitOfWork


async def publish(
    uow: UnitOfWork,
    recipient_user_ids: tuple[str, ...],
    intent: NotificationIntent,
    *,
    actor_id: str | None = None,
    request_id: str | None = None,
) -> dict[str, int]:
    "Совместимый отправитель в единице работы вызывающего кода; без SMTP и фиксации транзакции."
    plan = await uow.notifications.deliveries(
        tuple(sorted(set(recipient_user_ids))), intent.event_type
    )
    created = email_queued = 0
    for user_id, channel in plan.deliveries:
        result = await uow.notifications.enqueue(
            replace(intent, user_id=user_id, channel=cast(NotificationChannel, channel))
        )
        created += result.created
        email_queued += result.email_queued
    if created:
        await uow.audit.append(
            AuditRecord(
                action="NOTIFICATION_PUBLISH",
                entity_type=intent.entity_type or "NotificationEvent",
                entity_id=intent.entity_id or intent.dedupe_key,
                user_id=actor_id,
                request_id=request_id,
                details={
                    "eventType": intent.event_type,
                    "dedupeKey": intent.dedupe_key,
                    "recipientCount": len(plan.active_user_ids),
                    "deliveryCount": created,
                },
            )
        )
    return {"created": created, "emailQueued": email_queued}
