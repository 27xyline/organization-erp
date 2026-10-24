from __future__ import annotations

from urllib.parse import urlsplit

from app.core.config import Settings


def require_safe_seed_target(settings: Settings) -> str:
    parsed = urlsplit(settings.database_url.get_secret_value())
    database = parsed.path.removeprefix("/")
    if settings.environment == "production":
        raise RuntimeError("Seed запрещён в production")
    if database in {"organization_erp", "project1"}:
        raise RuntimeError("Seed запрещён для рабочей базы данных")
    if parsed.hostname not in {"localhost", "127.0.0.1", "::1", "postgres"}:
        raise RuntimeError("Seed разрешён только для локальной базы")
    return database
