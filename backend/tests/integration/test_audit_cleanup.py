from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select, text

from app.models.users import AuditLog, User
from tests.audit_cleanup import clear_audit_logs_for_test_cleanup


@pytest.mark.anyio
async def test_test_cleanup_allows_user_delete_without_disabling_audit_trigger(
    db_session_factory,
) -> None:
    suffix = uuid4().hex
    user_id = f"audit-cleanup-{suffix}"
    async with db_session_factory() as session:
        session.add(User(id=user_id, username=user_id, name="cleanup", passwordHash="unused"))
        await session.flush()
        session.add(
            AuditLog(
                id=f"audit-{suffix}",
                action="test_cleanup",
                entityType="User",
                entityId=user_id,
                userId=user_id,
            )
        )
        await session.commit()

    async with db_session_factory() as session:
        trigger_before = await session.scalar(
            text(
                "SELECT EXISTS (SELECT 1 FROM pg_trigger "
                "WHERE tgrelid = 'audit_logs'::regclass "
                "AND tgname = 'audit_logs_append_only' AND tgenabled = 'O' "
                "AND NOT tgisinternal)"
            )
        )
        assert trigger_before is True
        await clear_audit_logs_for_test_cleanup(session)
        await session.delete(await session.get(User, user_id))
        await session.commit()
        trigger_after = await session.scalar(
            text(
                "SELECT EXISTS (SELECT 1 FROM pg_trigger "
                "WHERE tgrelid = 'audit_logs'::regclass "
                "AND tgname = 'audit_logs_append_only' AND tgenabled = 'O' "
                "AND NOT tgisinternal)"
            )
        )
        assert trigger_after is True
        assert (
            await session.scalar(select(AuditLog.id).where(AuditLog.id == f"audit-{suffix}"))
            is None
        )
