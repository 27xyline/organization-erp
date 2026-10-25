"""Явная изоляция интеграционных тестов от рабочей базы данных."""

import os

from sqlalchemy.engine import make_url


def test_database_url() -> str:
    raw = os.environ.get("BACKEND_TEST_DATABASE_URL")
    if not raw:
        raise ValueError("BACKEND_TEST_DATABASE_URL must explicitly target erp_test")
    url = make_url(raw)
    if url.get_backend_name() != "postgresql" or url.database != "erp_test":
        raise ValueError("Integration tests require the isolated PostgreSQL database erp_test")
    return url.set(drivername="postgresql+asyncpg").render_as_string(hide_password=False)
