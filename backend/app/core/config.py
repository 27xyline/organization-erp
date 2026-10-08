from __future__ import annotations

from typing import Literal

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="BACKEND_",
        case_sensitive=False,
        extra="ignore",
        hide_input_in_errors=True,
    )

    database_url: SecretStr = SecretStr("postgresql+asyncpg://localhost:5432/organization_erp")
    environment: Literal["development", "test", "production"] = "development"
    db_connect_timeout_seconds: float = 3.0
    db_readiness_timeout_seconds: float = 5.0
    db_pool_size: int = 5
    db_max_overflow: int = 10
    db_pool_timeout_seconds: float = 5.0
    otel_enabled: bool = True
    otel_exporter_otlp_endpoint: str = "http://otel-collector:4318"
    otel_export_timeout_seconds: float = 2.0
    otel_shutdown_timeout_seconds: float = 2.0
    service_name: str = "organization-erp-backend"

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: object) -> SecretStr:
        raw = value.get_secret_value() if isinstance(value, SecretStr) else str(value)
        if raw.startswith("postgres://"):
            raw = "postgresql+asyncpg://" + raw.removeprefix("postgres://")
        elif raw.startswith("postgresql://"):
            raw = "postgresql+asyncpg://" + raw.removeprefix("postgresql://")
        elif raw.startswith("postgresql+psycopg://"):
            raw = "postgresql+asyncpg://" + raw.removeprefix("postgresql+psycopg://")
        return SecretStr(raw)

    @field_validator(
        "db_connect_timeout_seconds",
        "db_readiness_timeout_seconds",
        "db_pool_timeout_seconds",
        "otel_export_timeout_seconds",
        "otel_shutdown_timeout_seconds",
    )
    @classmethod
    def validate_positive_timeout(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("Timeout values must be greater than zero")
        return value
