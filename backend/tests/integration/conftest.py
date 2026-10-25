"""Каждый интеграционный тест начинает с пустой выделенной базы erp_test."""

import pytest
from sqlalchemy import text


@pytest.fixture(autouse=True)
async def clean_test_database(db_engine, anyio_backend):
    # db_engine проверяет URL и SELECT current_database() до любой записи.
    async with db_engine.begin() as connection:
        await connection.execute(
            text("""
            DO $$
            DECLARE tables_to_clear text;
            BEGIN
                SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
                INTO tables_to_clear FROM pg_tables
                WHERE schemaname = 'public'
                  AND tablename NOT IN ('alembic_version', '_prisma_migrations');
                IF tables_to_clear IS NOT NULL THEN
                    EXECUTE 'TRUNCATE TABLE ' || tables_to_clear || ' RESTART IDENTITY CASCADE';
                END IF;
            END $$;
        """)
        )
    yield
