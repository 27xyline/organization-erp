from __future__ import annotations

import pytest

from app.core.config import Settings


def test_database_url_uses_asyncpg_driver() -> None:
    settings = Settings(database_url="postgresql://user:secret@localhost:5432/erp")

    assert settings.database_url.get_secret_value().startswith("postgresql+asyncpg://")


def test_settings_load_canonical_environment_names(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BACKEND_DATABASE_URL", "postgresql://user:secret@localhost:5432/erp")
    monkeypatch.setenv("BACKEND_ENVIRONMENT", "test")
    monkeypatch.setenv("BACKEND_OTEL_ENABLED", "false")
    monkeypatch.setenv("BACKEND_OTEL_EXPORTER_OTLP_ENDPOINT", "http://collector:4318")

    settings = Settings()

    assert settings.environment == "test"
    assert settings.otel_enabled is False
    assert settings.otel_exporter_otlp_endpoint == "http://collector:4318"
    assert "secret" not in repr(settings)


@pytest.mark.parametrize("environment", ["development", "test", "production"])
def test_supported_environments(environment: str) -> None:
    assert Settings(environment=environment).environment == environment


def test_unknown_environment_is_rejected() -> None:
    with pytest.raises(ValueError):
        Settings(environment="staging")  # type: ignore[arg-type]
