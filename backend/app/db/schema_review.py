"""Read-only comparison of PostgreSQL schema and SQLAlchemy metadata."""

from __future__ import annotations

import asyncio
from pprint import pformat
from typing import Any, cast

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import Settings
from app.db.registry import Base


def _include_object(object_: Any, name: str, type_: str, reflected: bool, compare_to: Any) -> bool:
    return not (type_ == "table" and name == "_prisma_migrations")


def _compare(connection: Any) -> list[Any]:
    migration_context = MigrationContext.configure(
        connection,
        opts={
            "compare_type": True,
            "compare_server_default": True,
            "include_object": _include_object,
        },
    )
    return cast(list[Any], compare_metadata(migration_context, Base.metadata))


async def _read_differences() -> list[Any]:
    settings = Settings()
    database_url = settings.database_url.get_secret_value()
    parsed_url = make_url(database_url)
    if parsed_url.get_backend_name() != "postgresql" or parsed_url.database != "erp_stage02_test":
        raise RuntimeError(
            "Schema review is restricted to the erp_stage02_test PostgreSQL database"
        )

    engine = create_async_engine(database_url, echo=False, hide_parameters=True)
    try:
        async with engine.connect() as connection:
            async with connection.begin():
                await connection.exec_driver_sql("SET TRANSACTION READ ONLY")
                return await connection.run_sync(_compare)
    finally:
        await engine.dispose()


async def main() -> int:
    differences = await _read_differences()
    if differences:
        print(pformat(differences, sort_dicts=False))
        return 1
    print("No schema differences detected.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
