"""SMTP singleton settings with legacy-compatible text secret persistence."""

from __future__ import annotations

import asyncio
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.errors import DomainError
from app.integrations.smtp import SmtpCredentials, verify_smtp
from app.models.notifications import SmtpSettings


class SmtpSettingsService:
    def __init__(self, sessions: async_sessionmaker[AsyncSession]) -> None:
        self._sessions = sessions

    @staticmethod
    def public(row: SmtpSettings | None) -> dict[str, Any] | None:
        if row is None:
            return None
        return {
            "host": row.host,
            "port": row.port,
            "username": row.username,
            "secure": row.secure,
            "fromEmail": row.fromEmail,
            "password": "",
        }

    async def get(self) -> dict[str, Any] | None:
        async with self._sessions() as session:
            row = await session.get(SmtpSettings, "singleton")
            return self.public(row)

    async def save(self, values: dict[str, Any]) -> dict[str, Any]:
        async with self._sessions() as session, session.begin():
            row = await session.scalar(
                select(SmtpSettings).where(SmtpSettings.id == "singleton").with_for_update()
            )
            password = values.get("password", "")
            if not password and row is None:
                raise DomainError(
                    "BAD_REQUEST", "Пароль не может быть пустым при первой настройке", 400
                )
            if row is None:
                row = SmtpSettings(id="singleton", **values)
                session.add(row)
            else:
                for key in ("host", "port", "username", "secure", "fromEmail"):
                    setattr(row, key, values[key])
                if password:
                    row.password = password
            await session.flush()
            return self.public(row) or {}

    async def test(self, values: dict[str, Any]) -> bool:
        settings = dict(values)
        if not settings.get("password"):
            async with self._sessions() as session:
                row = await session.get(SmtpSettings, "singleton")
                if row is None:
                    raise DomainError(
                        "BAD_REQUEST", "Пароль не может быть пустым при первой настройке", 400
                    )
                settings["password"] = row.password
        creds = SmtpCredentials(
            settings["host"],
            settings["port"],
            settings["username"],
            settings["password"],
            settings["secure"],
            settings["fromEmail"],
        )
        return await asyncio.to_thread(verify_smtp, creds)
