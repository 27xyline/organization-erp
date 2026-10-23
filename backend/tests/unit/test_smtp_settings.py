from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services.smtp_settings import SmtpSettingsService


class _SettingsRepository:
    async def get(self):
        return SimpleNamespace(
            host="smtp.example.test",
            port=2525,
            username="mailer",
            password="stored-secret",
            secure=False,
            from_email="noreply@example.test",
        )


class _UnitOfWork:
    def __init__(self, factory):
        self.factory = factory
        self.smtp_settings = _SettingsRepository()

    async def __aenter__(self):
        self.factory.active = True
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        self.factory.active = False


class _UnitOfWorkFactory:
    active = False

    def __call__(self):
        return _UnitOfWork(self)


@pytest.mark.anyio
async def test_smtp_probe_runs_after_settings_transaction_closes():
    factory = _UnitOfWorkFactory()
    observations = []

    def verify(credentials):
        observations.append((factory.active, credentials.password, credentials.from_email))
        return True

    service = SmtpSettingsService(factory, verify)

    result = await service.test(
        {
            "host": "smtp.example.test",
            "port": 2525,
            "username": "mailer",
            "password": "",
            "secure": False,
            "fromEmail": "noreply@example.test",
        }
    )

    assert result is True
    assert observations == [(False, "stored-secret", "noreply@example.test")]
