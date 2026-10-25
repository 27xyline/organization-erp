from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import Settings

ROOT = Path(__file__).resolve().parents[2]
EXPECTED_CATALOG = ROOT / "migrations" / "schema_catalog.json"
SERVICE_TABLES = {"_prisma_migrations", "alembic_version"}

_CATALOG_QUERIES = {
    "enums": """
        SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
        GROUP BY t.typname
        ORDER BY t.typname
    """,
    "tables": """
        SELECT c.relname AS name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
        ORDER BY c.relname
    """,
    "columns": """
        SELECT c.relname AS table_name, a.attname AS name,
               format_type(a.atttypid, a.atttypmod) AS type,
               NOT a.attnotnull AS nullable,
               pg_get_expr(d.adbin, d.adrelid) AS default
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
          AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY c.relname, a.attnum
    """,
    "constraints": """
        SELECT c.relname AS table_name, con.conname AS name,
               pg_get_constraintdef(con.oid, true) AS definition,
               con.contype AS constraint_type,
               con.convalidated AS validated,
               con.condeferrable AS deferrable,
               con.condeferred AS deferred,
               con.conislocal AS is_local,
               con.coninhcount AS inheritance_count,
               con.connoinherit AS no_inherit,
               a.attname AS column_name,
               a.attnotnull AS column_not_null,
               (c.relname || '_' || a.attname || '_not_null')::name AS generated_name
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attribute a ON a.attrelid = c.oid
          AND array_length(con.conkey, 1) = 1 AND a.attnum = con.conkey[1]
        WHERE n.nspname = 'public'
        ORDER BY c.relname, con.conname
    """,
    "indexes": """
        SELECT tablename AS table_name, indexname AS name, indexdef AS definition
        FROM pg_indexes WHERE schemaname = 'public'
        ORDER BY tablename, indexname
    """,
    "functions": """
        SELECT p.proname AS name, pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prokind = 'f'
        ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)
    """,
    "triggers": """
        SELECT c.relname AS table_name, t.tgname AS name,
               pg_get_triggerdef(t.oid, true) AS definition
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND NOT t.tgisinternal
        ORDER BY c.relname, t.tgname
    """,
}


async def catalog_snapshot(engine: AsyncEngine) -> dict[str, Any]:
    """Читает исходные объекты каталога PostgreSQL, не обращаясь к метаданным SQLAlchemy."""
    snapshot: dict[str, Any] = {"enums": {}, "tables": {}}
    async with engine.connect() as connection:
        for row in (await connection.execute(text(_CATALOG_QUERIES["enums"]))).mappings():
            snapshot["enums"][row["name"]] = list(row["labels"])
        table_names = [
            row["name"]
            for row in (await connection.execute(text(_CATALOG_QUERIES["tables"]))).mappings()
            if row["name"] not in SERVICE_TABLES
        ]
        snapshot["tables"] = {
            name: {"columns": {}, "constraints": {}, "indexes": {}, "triggers": {}}
            for name in table_names
        }
        for key in ("columns", "constraints", "indexes", "triggers"):
            result = await connection.execute(text(_CATALOG_QUERIES[key]))
            for row in result.mappings():
                table = row["table_name"]
                if table not in snapshot["tables"]:
                    continue
                if key == "constraints" and _is_column_not_null_duplicate(row):
                    continue
                target = snapshot["tables"][table][key]
                if key == "columns":
                    target[row["name"]] = {
                        "type": row["type"],
                        "nullable": row["nullable"],
                        "default": row["default"],
                    }
                else:
                    target[row["name"]] = row["definition"]
        result = await connection.execute(text(_CATALOG_QUERIES["functions"]))
        snapshot["functions"] = {row["name"]: row["definition"] for row in result.mappings()}
    return snapshot


def _is_column_not_null_duplicate(row: Any) -> bool:
    """Игнорирует созданную в PG18 строку каталога NOT NULL, уже представленную полем attnotnull."""
    return (
        row["constraint_type"] in ("n", b"n")
        and row["column_not_null"] is True
        and row["name"] == row["generated_name"]
        and row["validated"] is True
        and row["deferrable"] is False
        and row["deferred"] is False
        and row["is_local"] is True
        and row["inheritance_count"] == 0
        and row["no_inherit"] is False
    )


def compare_catalogs(expected: dict[str, Any], actual: dict[str, Any]) -> list[str]:
    """Возвращает детерминированные различия на уровне каталога между ожидаемым \
    и действующим DDL."""
    differences: list[str] = []
    expected = json.loads(json.dumps(expected))
    actual = json.loads(json.dumps(actual))
    for catalog in (expected, actual):
        tables = catalog.get("tables")
        if isinstance(tables, dict):
            for table in SERVICE_TABLES:
                tables.pop(table, None)

    def compare(path: str, left: Any, right: Any) -> None:
        if isinstance(left, dict) and isinstance(right, dict):
            for key in sorted(left.keys() | right.keys()):
                if key not in left:
                    differences.append(f"{path}.{key}: unexpected object")
                elif key not in right:
                    differences.append(f"{path}.{key}: missing object")
                else:
                    compare(f"{path}.{key}", left[key], right[key])
        elif left != right:
            differences.append(f"{path}: expected {left!r}, found {right!r}")

    compare("catalog", expected, actual)
    return differences


async def verify_schema(
    engine: AsyncEngine,
    expected_catalog_path: Path = EXPECTED_CATALOG,
) -> list[str]:
    expected = json.loads(await asyncio.to_thread(expected_catalog_path.read_text))
    actual = await catalog_snapshot(engine)
    return compare_catalogs(expected, actual)


async def _main(expected_catalog_path: Path = EXPECTED_CATALOG) -> int:
    from sqlalchemy.ext.asyncio import create_async_engine

    engine = create_async_engine(Settings().database_url.get_secret_value())
    try:
        differences = await verify_schema(engine, expected_catalog_path)
    finally:
        await engine.dispose()
    if differences:
        print("Schema catalog verification failed:")
        for difference in differences:
            print(f"- {difference}")
        return 1
    print("Schema catalog matches the configured expected catalog.")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    raise SystemExit(asyncio.run(_main(EXPECTED_CATALOG)))


if __name__ == "__main__":
    main()
