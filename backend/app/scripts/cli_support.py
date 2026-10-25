from __future__ import annotations

from urllib.parse import urlsplit

from app.core.config import Settings


def require_safe_seed_target(settings: Settings, *, allow_local_demo_database: bool = False) -> str:
    parsed = urlsplit(settings.database_url.get_secret_value())
    database = parsed.path.removeprefix("/")
    if settings.environment == "production":
        raise RuntimeError("Seed запрещён в production")
    if database == "organization_erp":
        raise RuntimeError("Seed запрещён для рабочей базы данных")
    if parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise RuntimeError("Seed разрешён только для локальной базы")
    if database != "organization_erp_dev":
        raise RuntimeError("Seed разрешён только для локальной базы organization_erp_dev")
    if not allow_local_demo_database:
        raise RuntimeError(
            "Для заполнения локальной базы organization_erp_dev добавьте флаг --allow-local-demo-db"
        )
    if settings.environment != "development":
        raise RuntimeError("Демо-данные разрешено добавлять только в development")
    return database
