"Сценарии настроек SMTP; соединение проверяется вне транзакции базы данных."

from __future__ import annotations

import asyncio
from typing import Any

from app.domain.errors import DomainError
from app.domain.ports.smtp import SmtpCredentials, SmtpSettingsRecord, SmtpVerifier
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory


class SmtpSettingsService:
    def __init__(
        self,
        factory: UnitOfWorkFactory[UnitOfWork],
        verify_smtp: SmtpVerifier,
    ) -> None:
        self._factory = factory
        self._verify_smtp = verify_smtp

    @staticmethod
    def public(row: SmtpSettingsRecord | None) -> dict[str, Any] | None:
        if row is None:
            return None
        return {
            "host": row.host,
            "port": row.port,
            "username": row.username,
            "secure": row.secure,
            "fromEmail": row.from_email,
            "password": "",
        }

    async def get(self) -> dict[str, Any] | None:
        async with self._factory() as uow:
            row = await uow.smtp_settings.get()
            return self.public(row)

    async def save(self, values: dict[str, Any]) -> dict[str, Any]:
        async with self._factory() as uow:
            row = await uow.smtp_settings.save(values)
            if row is None:
                raise DomainError(
                    "BAD_REQUEST", "Пароль не может быть пустым при первой настройке", 400
                )
            await uow.commit()
            return self.public(row) or {}

    async def test(self, values: dict[str, Any]) -> bool:
        settings = dict(values)
        if not settings.get("password"):
            async with self._factory() as uow:
                row = await uow.smtp_settings.get()
            if row is None:
                raise DomainError(
                    "BAD_REQUEST", "Пароль не может быть пустым при первой настройке", 400
                )
            settings["password"] = row.password
        credentials = SmtpCredentials(
            settings["host"],
            settings["port"],
            settings["username"],
            settings["password"],
            settings["secure"],
            settings["fromEmail"],
        )
        return await asyncio.to_thread(self._verify_smtp, credentials)
