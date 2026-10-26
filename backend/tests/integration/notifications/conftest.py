from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4

import pytest
from sqlalchemy import delete

from app.core.context import Actor, RequestContext
from app.db.uow import create_unit_of_work_factory
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.models.notifications import Notification, NotificationOutbox, NotificationPreference
from app.models.users import AuditLog, User
from app.services.notifications import NotificationService
from tests.audit_cleanup import clear_audit_logs_for_test_cleanup


@dataclass
class NotificationEnv:
    service: NotificationService
    owner_id: str
    other_id: str
    context: RequestContext
    sessions: object


@pytest.fixture
async def notification_env(db_session_factory):
    prefix = "s09-notify-" + uuid4().hex
    owner_id, other_id = prefix + "-owner", prefix + "-other"
    access = AccessContext(prefix, None, None, (), (ScopeGrant(prefix, "ADMIN", "ALL", "ALL"),))
    actor = Actor(owner_id, is_authenticated=True, session_version=1, access=access)
    context = RequestContext(prefix, actor=actor)
    async with db_session_factory() as session:
        for identifier in (owner_id, other_id):
            session.add(
                User(
                    id=identifier,
                    username=identifier,
                    name=identifier,
                    passwordHash="unused",
                    mustChangePassword=False,
                    role="ADMIN",
                )
            )
        await session.commit()
    env = NotificationEnv(
        NotificationService(create_unit_of_work_factory(db_session_factory)),
        owner_id,
        other_id,
        context,
        db_session_factory,
    )
    try:
        yield env
    finally:
        async with db_session_factory() as session:
            await clear_audit_logs_for_test_cleanup(session)
            await session.execute(
                delete(NotificationOutbox).where(
                    NotificationOutbox.userId.in_([owner_id, other_id])
                )
            )
            await session.execute(
                delete(Notification).where(Notification.userId.in_([owner_id, other_id]))
            )
            await session.execute(
                delete(NotificationPreference).where(
                    NotificationPreference.userId.in_([owner_id, other_id])
                )
            )
            await session.execute(delete(AuditLog).where(AuditLog.userId.in_([owner_id, other_id])))
            await session.execute(delete(User).where(User.id.in_([owner_id, other_id])))
            await session.commit()
