import asyncio

import pytest
from sqlalchemy import func, select

from app.db.uow import create_unit_of_work_factory
from app.domain.errors import DomainError
from app.domain.ports.notifications import NotificationIntent
from app.models.notifications import Notification, NotificationPreference, SmtpSettings
from app.services.dto.notifications import NotificationQuery
from app.services.smtp_settings import SmtpSettingsService


@pytest.mark.anyio
async def test_in_app_list_and_mutations_are_owner_scoped(notification_env):
    env = notification_env
    async with env.sessions() as session:
        session.add_all(
            [
                Notification(
                    id=f"{env.owner_id}-notice",
                    userId=env.owner_id,
                    eventType="SYSTEM",
                    channel="IN_APP",
                    title="Своё",
                    body="Тест",
                    dedupeKey=f"{env.owner_id}-dedupe",
                ),
                Notification(
                    id=f"{env.other_id}-notice",
                    userId=env.other_id,
                    eventType="SYSTEM",
                    channel="IN_APP",
                    title="Чужое",
                    body="Тест",
                    dedupeKey=f"{env.other_id}-dedupe",
                ),
            ]
        )
        await session.commit()

    records, total = await env.service.list_notifications(
        NotificationQuery(page=1, pageSize=20, unreadOnly=False), env.context
    )
    assert total == 1 and [item["id"] for item in records] == [f"{env.owner_id}-notice"]
    with pytest.raises(DomainError) as failure:
        await env.service.set_read(f"{env.other_id}-notice", True, env.context)
    assert failure.value.code == "NOT_FOUND"

    await env.service.set_read(f"{env.owner_id}-notice", True, env.context)
    assert await env.service.unread_count(env.context) == 0


@pytest.mark.anyio
async def test_duplicate_preference_upserts_and_notification_intents_dedupe(notification_env):
    env = notification_env
    updates = await asyncio.gather(
        env.service.update_preferences(
            [{"eventType": "SYSTEM", "channel": "EMAIL", "enabled": False}], env.context
        ),
        env.service.update_preferences(
            [{"eventType": "SYSTEM", "channel": "EMAIL", "enabled": True}], env.context
        ),
    )
    assert len(updates) == 2
    async with env.sessions() as session:
        count = await session.scalar(
            select(func.count())
            .select_from(NotificationPreference)
            .where(
                NotificationPreference.userId == env.owner_id,
                NotificationPreference.eventType == "SYSTEM",
                NotificationPreference.channel == "EMAIL",
            )
        )
    assert count == 1

    factory = create_unit_of_work_factory(env.sessions)
    intent = NotificationIntent(
        user_id=env.owner_id,
        event_type="SYSTEM",
        channel="IN_APP",
        title="Дедупликация",
        body="Одна запись",
        dedupe_key=f"{env.owner_id}-dedupe-event",
        payload={"eventType": "SYSTEM", "title": "Дедупликация", "body": "Одна запись"},
    )
    async with factory() as uow:
        first = await uow.notifications.enqueue(intent)
        second = await uow.notifications.enqueue(intent)
        await uow.commit()
    assert first.created == 1 and second.created == 0


@pytest.mark.anyio
async def test_smtp_secret_is_redacted_and_empty_password_reuses_legacy_text_value(
    db_session_factory, monkeypatch
):
    async with db_session_factory() as session:
        original = await session.get(SmtpSettings, "singleton")
        snapshot = (
            {
                "host": original.host,
                "port": original.port,
                "username": original.username,
                "password": original.password,
                "secure": original.secure,
                "fromEmail": original.fromEmail,
            }
            if original
            else None
        )

    service = SmtpSettingsService(db_session_factory)
    settings = {
        "host": "smtp.stage09.invalid",
        "port": 2525,
        "username": "stage09-user",
        "password": "legacy-text-secret",
        "secure": False,
        "fromEmail": "stage09@example.invalid",
    }
    try:
        public = await service.save(settings)
        assert public["password"] == ""
        retained = await service.save({**settings, "password": ""})
        assert retained["password"] == ""

        seen = []

        def verify(credentials):
            seen.append(credentials.password)
            return True

        monkeypatch.setattr("app.services.smtp_settings.verify_smtp", verify)
        assert await service.test({**settings, "password": ""}) is True
        assert seen == ["legacy-text-secret"]
    finally:
        async with db_session_factory() as session, session.begin():
            row = await session.get(SmtpSettings, "singleton")
            if snapshot is None:
                if row is not None:
                    await session.delete(row)
            elif row is None:
                session.add(SmtpSettings(id="singleton", **snapshot))
            else:
                for key, value in snapshot.items():
                    setattr(row, key, value)
