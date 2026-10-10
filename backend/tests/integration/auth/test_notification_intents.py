import asyncio
from dataclasses import replace

import pytest
from sqlalchemy import func, select

from app.domain.ports.notifications import NotificationIntent
from app.models.enums import NotificationChannel, NotificationEventType
from app.models.notifications import Notification, NotificationOutbox, NotificationPreference
from app.services.notification_intents import publish


@pytest.mark.anyio
async def test_notifications_preferences_dedupe_and_legacy_worker_payload(auth_env):
    env = auth_env
    identifier = await env["seed"]()
    disabled = await env["seed"](active=False)
    async with env["sessions"]() as session:
        session.add(
            NotificationPreference(
                userId=identifier,
                eventType=NotificationEventType.SYSTEM,
                channel=NotificationChannel.EMAIL,
                enabled=True,
            )
        )
        await session.commit()
    intent = NotificationIntent(
        user_id=identifier,
        event_type="SYSTEM",
        channel="IN_APP",
        title="Title",
        body="Body",
        dedupe_key=env["prefix"],
        payload={"untrusted": "ignored"},
        target_url="/account/password",
    )

    async def produce():
        async with env["factory"]() as uow:
            await publish(uow, (identifier, identifier, disabled), intent)
            await uow.commit()

    await asyncio.gather(produce(), produce())
    async with env["sessions"]() as session:
        notifications = (
            await session.scalars(
                select(Notification).where(Notification.dedupeKey == env["prefix"])
            )
        ).all()
        assert len(notifications) == 2
        assert {n.channel for n in notifications} == {
            NotificationChannel.IN_APP,
            NotificationChannel.EMAIL,
        }
        outboxes = (
            await session.scalars(
                select(NotificationOutbox).where(NotificationOutbox.userId == identifier)
            )
        ).all()
        assert len(outboxes) == 1
        assert outboxes[0].payload == {
            "eventType": "SYSTEM",
            "title": "Title",
            "body": "Body",
            "targetUrl": "/account/password",
        }
        session.add(
            NotificationPreference(
                userId=identifier,
                eventType=NotificationEventType.SYSTEM,
                channel=NotificationChannel.IN_APP,
                enabled=False,
            )
        )
        # Replace email preference as well: no deliveries when both channels are disabled.
        existing = await session.scalar(
            select(NotificationPreference).where(
                NotificationPreference.userId == identifier,
                NotificationPreference.channel == NotificationChannel.EMAIL,
            )
        )
        existing.enabled = False
        await session.commit()
    async with env["factory"]() as uow:
        await publish(uow, (identifier,), replace(intent, dedupe_key=env["prefix"] + "-disabled"))
        await uow.commit()
    async with env["sessions"]() as session:
        assert (
            await session.scalar(
                select(func.count())
                .select_from(Notification)
                .where(Notification.dedupeKey == env["prefix"] + "-disabled")
            )
            == 0
        )
