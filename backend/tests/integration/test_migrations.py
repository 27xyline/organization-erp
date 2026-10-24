from __future__ import annotations

import os
from copy import deepcopy
from importlib import import_module
from urllib.parse import urlparse
from uuid import uuid4

import pytest
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import create_async_engine

from app.scripts.verify_schema import compare_catalogs, verify_schema

_BASELINE = import_module("migrations.versions.20261024_legacy_schema")


@pytest.fixture
async def stage14a_engine():
    url = os.environ.get("STAGE14A_TEST_DATABASE_URL")
    if not url:
        pytest.fail("STAGE14A_TEST_DATABASE_URL must target a disposable Stage 14A database")
    database = urlparse(url).path.lstrip("/")
    if database not in {"stage14a_empty", "stage14a_existing", "erp_stage02_test"}:
        pytest.fail("Stage 14A tests require a named disposable rehearsal or CI database")
    engine = create_async_engine(url)
    try:
        yield engine
    finally:
        await engine.dispose()


def _catalog() -> dict[str, object]:
    return {
        "enums": {"asset_status": ["ACTIVE", "DISPOSED"]},
        "tables": {
            "audit_logs": {
                "columns": {"id": {"type": "text", "nullable": False, "default": None}},
                "constraints": {"audit_logs_pkey": "PRIMARY KEY (id)"},
                "indexes": {
                    "audit_logs_entity_idx": (
                        "CREATE INDEX audit_logs_entity_idx ON audit_logs (entityId)"
                    )
                },
                "triggers": {"audit_logs_append_only": "BEFORE UPDATE OR DELETE"},
            }
        },
    }


def test_catalog_verifier_catches_raw_constraint_index_enum_and_default_drift() -> None:
    expected = _catalog()
    actual = deepcopy(expected)
    actual["enums"]["asset_status"] = ["ACTIVE"]
    audit = actual["tables"]["audit_logs"]
    audit["columns"]["id"]["default"] = "'generated'::text"
    audit["constraints"]["audit_logs_pkey"] = "PRIMARY KEY (id, entityId)"
    audit["indexes"].pop("audit_logs_entity_idx")

    differences = compare_catalogs(expected, actual)

    assert any("asset_status" in difference for difference in differences)
    assert any("default" in difference for difference in differences)
    assert any("audit_logs_pkey" in difference for difference in differences)
    assert any("audit_logs_entity_idx" in difference for difference in differences)


def test_catalog_verifier_ignores_only_prisma_migration_ledger() -> None:
    expected = _catalog()
    actual = deepcopy(expected)
    actual["tables"]["_prisma_migrations"] = {
        "columns": {},
        "constraints": {},
        "indexes": {},
        "triggers": {},
    }

    assert compare_catalogs(expected, actual) == []


def test_frozen_baseline_sql_splitter_keeps_procedural_bodies_intact() -> None:
    statements = _BASELINE._split_sql("DO $$ BEGIN RAISE NOTICE 'inside; body'; END $$; SELECT 1;")

    assert statements == ["DO $$ BEGIN RAISE NOTICE 'inside; body'; END $$", "SELECT 1"]


@pytest.mark.anyio
async def test_catalog_verifier_accepts_the_live_frozen_schema(stage14a_engine) -> None:
    assert await verify_schema(stage14a_engine) == []


@pytest.mark.parametrize("operation", ["UPDATE", "DELETE"])
@pytest.mark.anyio
async def test_audit_log_rejects_direct_sql_mutation(stage14a_engine, operation: str) -> None:
    from sqlalchemy import text

    async with stage14a_engine.connect() as connection:
        transaction = await connection.begin()
        row_id = f"stage14a-{uuid4().hex}"
        await connection.execute(
            text(
                'INSERT INTO audit_logs (id, action, "entityType", "entityId") '
                "VALUES (:id, 'stage14a_test', 'Stage14A', :id)"
            ),
            {"id": row_id},
        )
        statement = (
            "UPDATE audit_logs SET action = action WHERE id = :id"
            if operation == "UPDATE"
            else "DELETE FROM audit_logs WHERE id = :id"
        )
        with pytest.raises(DBAPIError):
            await connection.execute(text(statement), {"id": row_id})
        await transaction.rollback()
