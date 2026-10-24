"""Safe audit-log cleanup for the explicitly disposable integration databases."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_DISPOSABLE_DATABASES = {f"erp_stage{stage:02d}_test" for stage in range(2, 15)} | {
    "erp_stage14b_test"
}


async def clear_audit_logs_for_test_cleanup(session: AsyncSession) -> None:
    """Clear audit rows when their append-only trigger prevents fixture teardown.

    This helper is deliberately unavailable to arbitrary databases. TRUNCATE is
    test cleanup only and must never weaken or alter the production trigger.
    """
    database = await session.scalar(text("SELECT current_database()"))
    if database not in _DISPOSABLE_DATABASES:
        raise RuntimeError("Audit cleanup is restricted to named disposable test databases")

    has_append_only_trigger = await session.scalar(
        text(
            "SELECT EXISTS (SELECT 1 FROM pg_trigger "
            "JOIN pg_class ON pg_class.oid = pg_trigger.tgrelid "
            "WHERE pg_class.relname = 'audit_logs' "
            "AND pg_trigger.tgname = 'audit_logs_append_only' "
            "AND NOT pg_trigger.tgisinternal)"
        )
    )
    if has_append_only_trigger:
        await session.execute(text("TRUNCATE TABLE audit_logs"))
