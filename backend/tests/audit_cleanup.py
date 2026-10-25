"""Безопасная очистка журнала аудита в явно выделенных временных базах интеграционных тестов."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_DISPOSABLE_DATABASES = {"erp_test"}


async def clear_audit_logs_for_test_cleanup(session: AsyncSession) -> None:
    """Удалить записи аудита, если триггер запрета изменений мешает очистке фикстур.

    Эта функция намеренно недоступна для произвольных баз данных. TRUNCATE
    используется только для очистки тестов и не должен ослаблять или изменять
    триггер рабочей базы.
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
