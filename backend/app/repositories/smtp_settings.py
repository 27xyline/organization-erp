"""Сохранение единственной записи настроек SMTP через SQLAlchemy."""

from collections.abc import Callable
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.ports.smtp import SmtpSettingsPort, SmtpSettingsRecord
from app.models.notifications import SmtpSettings as SmtpSettingsModel


class SqlAlchemySmtpSettingsRepository(SmtpSettingsPort):
    def __init__(self, session: Callable[[], AsyncSession]) -> None:
        self._session = session

    @staticmethod
    def _record(row: SmtpSettingsModel | None) -> SmtpSettingsRecord | None:
        if row is None:
            return None
        return SmtpSettingsRecord(
            host=row.host,
            port=row.port,
            username=row.username,
            password=row.password,
            secure=row.secure,
            from_email=row.fromEmail,
        )

    async def get(self) -> SmtpSettingsRecord | None:
        row = await self._session().get(SmtpSettingsModel, "singleton")
        return self._record(row)

    async def save(self, values: dict[str, Any]) -> SmtpSettingsRecord | None:
        session = self._session()
        row = await session.scalar(
            select(SmtpSettingsModel).where(SmtpSettingsModel.id == "singleton").with_for_update()
        )
        password = values.get("password", "")
        if not password and row is None:
            return None
        if row is None:
            row = SmtpSettingsModel(id="singleton", **values)
            session.add(row)
        else:
            for key in ("host", "port", "username", "secure", "fromEmail"):
                setattr(row, key, values[key])
            if password:
                row.password = password
        await session.flush()
        return self._record(row)
