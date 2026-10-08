from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import Settings
from app.db.registry import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

command = getattr(getattr(config, "cmd_opts", None), "cmd", None)
if isinstance(command, tuple) and command:
    command = command[0]
command_name = getattr(command, "__name__", "")
# This guard runs only for commands that import env.py. Plain `alembic revision`
# without --autogenerate can bypass it; the stage policy still forbids revisions.
if command_name in {
    "check",
    "ensure_version",
    "revision",
    "upgrade",
    "downgrade",
    "stamp",
}:
    raise RuntimeError(
        "Alembic commands that load env.py are disabled by the migration-stage policy; "
        "use `python -m app.db.schema_review` for read-only metadata comparison."
    )

target_metadata = Base.metadata


def include_object(object_, name, type_, reflected, compare_to):
    """Ignore Prisma's migration ledger during schema comparisons."""
    return not (type_ == "table" and name == "_prisma_migrations")


def _configure_context(**kwargs: object) -> None:
    context.configure(
        target_metadata=target_metadata,
        include_object=include_object,
        compare_type=True,
        compare_server_default=True,
        **kwargs,
    )


def run_migrations_offline() -> None:
    database_url = Settings().database_url.get_secret_value()
    _configure_context(
        url=database_url,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def _run_migrations(connection) -> None:
    _configure_context(connection=connection)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = Settings().database_url.get_secret_value()
    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    try:
        async with connectable.connect() as connection:
            await connection.run_sync(_run_migrations)
    finally:
        await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
