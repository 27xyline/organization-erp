from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="BACKEND_",
        case_sensitive=False,
        extra="ignore",
        populate_by_name=True,
        hide_input_in_errors=True,
    )

    document_storage_root: Path = Field(
        default_factory=lambda: Path(__file__).resolve().parents[3] / ".runtime" / "documents",
        validation_alias=AliasChoices("DOCUMENT_STORAGE_ROOT", "BACKEND_DOCUMENT_STORAGE_ROOT"),
    )
    document_max_file_size_bytes: int = Field(
        default=25 * 1024 * 1024,
        gt=0,
        le=100 * 1024 * 1024,
        validation_alias=AliasChoices(
            "DOCUMENT_MAX_FILE_SIZE_BYTES", "BACKEND_DOCUMENT_MAX_FILE_SIZE_BYTES"
        ),
    )

    database_url: SecretStr = SecretStr("postgresql+asyncpg://localhost:5432/organization_erp")
    csrf_secret: SecretStr | None = Field(default=None, repr=False)
    public_origin: str | None = None
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

    @field_validator("document_storage_root")
    @classmethod
    def document_root_from_project(cls, value: Path) -> Path:
        return value if value.is_absolute() else Path(__file__).resolve().parents[3] / value

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
