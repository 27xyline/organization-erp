from __future__ import annotations

import json
import re
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import BigInteger, Boolean, Date, Enum, Integer, Numeric, Sequence, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TIMESTAMP

from app.db.base import new_cuid, utc_now_naive
from app.db.registry import Base

ROOT = Path(__file__).parents[3]
INVENTORY = json.loads((ROOT / "docs/backend-migration/schema-inventory.json").read_text())


def test_metadata_matches_all_inventoried_tables_and_columns() -> None:
    metadata = Base.metadata
    models = INVENTORY["models"]
    assert set(metadata.tables) == {model["sql_name"] for model in models}

    for model in models:
        table = metadata.tables[model["sql_name"]]
        expected_columns = {column["sql_name"] for column in model["columns"]}
        assert set(table.columns.keys()) == expected_columns

        primary_key = next(c for c in model["constraints"] if c["kind"] == "primary_key")
        actual_pk = next(
            c for c in table.constraints if c.__class__.__name__ == "PrimaryKeyConstraint"
        )
        assert actual_pk.name == primary_key["name"]
        assert tuple(column.name for column in actual_pk.columns) == tuple(primary_key["columns"])

        for expected in model["columns"]:
            column = table.c[expected["sql_name"]]
            assert column.nullable is expected["sql"]["nullable"]
            sql_type = expected["sql"]["type"]
            if sql_type.startswith('"'):
                assert isinstance(column.type, Enum)
                enum = next(
                    item for item in INVENTORY["enums"] if item["sql_name"] == sql_type.strip('"')
                )
                assert column.type.name == enum["sql_name"]
                assert column.type.enums == enum["sql"]["values"]
            elif sql_type.startswith("DECIMAL"):
                match = re.search(r"DECIMAL\(\s*(\d+)\s*,\s*(\d+)\s*\)", sql_type)
                assert isinstance(column.type, Numeric)
                assert (column.type.precision, column.type.scale) == tuple(map(int, match.groups()))
            elif sql_type == "TIMESTAMP(3)":
                assert isinstance(column.type, TIMESTAMP)
                assert column.type.timezone is False
                assert column.type.precision == 3
            elif sql_type == "DATE":
                assert isinstance(column.type, Date)
            elif sql_type == "JSONB":
                assert isinstance(column.type, JSONB)
                assert column.type.none_as_null is column.nullable
            elif sql_type == "TEXT[]":
                assert isinstance(column.type, ARRAY)
                assert isinstance(column.type.item_type, Text)
            elif sql_type == "TEXT":
                assert isinstance(column.type, Text)
            elif sql_type == "SERIAL":
                assert isinstance(column.type, Integer)
            elif sql_type == "BIGINT":
                assert isinstance(column.type, BigInteger)
            elif sql_type == "INTEGER":
                assert isinstance(column.type, Integer)
            elif sql_type == "BOOLEAN":
                assert isinstance(column.type, Boolean)
            else:
                raise AssertionError(f"Unmapped SQL type {sql_type!r}")

            if expected["updated_at"]:
                assert column.server_default is None
                assert _wrapped_default(column.default.arg) is utc_now_naive
                assert _wrapped_default(column.onupdate.arg) is utc_now_naive
            elif expected["prisma_default"] == "cuid()":
                assert _wrapped_default(column.default.arg) is new_cuid
            elif expected["prisma_default"] == "autoincrement()":
                assert isinstance(column.default, Sequence)
                assert column.default.name == "assets_orderNumber_seq"
                assert column.server_default is None

        expected_indexes = {index["name"]: index for index in model["indexes"]}
        actual_indexes = {index.name: index for index in table.indexes}
        assert set(actual_indexes) == set(expected_indexes)
        for name, expected in expected_indexes.items():
            actual = actual_indexes[name]
            assert actual.unique is expected["unique"]
            if expected["columns"]:
                assert tuple(column.name for column in actual.columns) == tuple(expected["columns"])
            if expected["predicate"]:
                assert actual.dialect_options["postgresql"].get("where") is not None
            if expected["columns"] is None:
                assert actual.expressions

        expected_fks = {
            constraint["name"]: constraint
            for constraint in model["constraints"]
            if constraint["kind"] == "foreign_key"
        }
        actual_fks = {constraint.name: constraint for constraint in table.foreign_key_constraints}
        assert set(actual_fks) == set(expected_fks)
        for name, expected in expected_fks.items():
            actual = actual_fks[name]
            assert tuple(column.name for column in actual.columns) == tuple(expected["columns"])
            assert tuple(element.target_fullname for element in actual.elements) == tuple(
                f"{expected['referenced_table']}.{column}"
                for column in expected["referenced_columns"]
            )
            assert actual.ondelete == expected["on_delete"]
            assert actual.onupdate == expected["on_update"]

        expected_checks = {
            constraint["name"]
            for constraint in model["constraints"]
            if constraint["kind"] == "check"
        }
        actual_checks = {
            constraint.name
            for constraint in table.constraints
            if constraint.__class__.__name__ == "CheckConstraint"
        }
        assert actual_checks == expected_checks


def test_schema_defaults_and_enum_metadata_are_complete() -> None:
    metadata = Base.metadata
    enum_columns = {
        column.type.name: column.type
        for table in metadata.tables.values()
        for column in table.columns
        if isinstance(column.type, Enum)
    }
    assert set(enum_columns) == {enum["sql_name"] for enum in INVENTORY["enums"]}
    for enum in INVENTORY["enums"]:
        assert enum_columns[enum["sql_name"]].enums == enum["sql"]["values"]

    assert (
        sum(
            column.default is not None and column.name == "id"
            for table in metadata.tables.values()
            for column in table.columns
        )
        == 49
    )
    assert (
        sum(len(table.columns) for table in metadata.tables.values())
        == INVENTORY["counts"]["columns"]
    )
    assert (
        sum(len(table.indexes) for table in metadata.tables.values())
        == INVENTORY["counts"]["indexes"]
    )
    assert (
        sum(len(table.foreign_key_constraints) for table in metadata.tables.values())
        == INVENTORY["counts"]["foreign_keys"]
    )
    assert (
        sum(
            sum(
                constraint.__class__.__name__ == "CheckConstraint"
                for constraint in table.constraints
            )
            for table in metadata.tables.values()
        )
        == INVENTORY["counts"]["checks"]
    )


def test_generated_ids_keep_cuid_contract_without_ordering_promise() -> None:
    first, second = new_cuid(), new_cuid()
    assert first != second
    assert re.fullmatch(r"c[a-z0-9]{24}", first)
    assert re.fullmatch(r"c[a-z0-9]{24}", second)


def test_sql_normalization_preserves_meaningful_case_casts_and_grouping() -> None:
    assert _normalize_sql("'DRAFT'") != _normalize_sql("'draft'")
    assert _normalize_sql('"userId"') != _normalize_sql('"userid"')
    assert _normalize_sql("amount > 0") != _normalize_sql("amount >= 0")
    assert _normalize_sql("amount::numeric >= 0") != _normalize_sql("amount >= 0")
    assert _normalize_sql("(a OR b) AND c") != _normalize_sql("a OR b AND c")

    assert _normalize_sql("amount >= 0::numeric") == _normalize_sql("amount >= 0")
    assert _normalize_sql("level BETWEEN 1 AND 5") == _normalize_sql("level >= 1 AND level <= 5")
    assert _normalize_sql("(a AND b) OR (c AND d)") == _normalize_sql("a AND b OR c AND d")


def _wrapped_default(value):
    """SQLAlchemy wraps Python defaults in a context-taking function."""
    closure = getattr(value, "__closure__", None)
    if closure and len(closure) == 1 and callable(closure[0].cell_contents):
        return closure[0].cell_contents
    return value


@pytest.mark.anyio
async def test_postgres_round_trips_id_types_arrays_json_enums_and_timestamps(
    db_session_factory,
) -> None:
    from datetime import date, datetime

    from app.models.assets import Asset, AssetMaintenance
    from app.models.catalogs import AssetGroup, Mol
    from app.models.departments import Department
    from app.models.enums import AssetMaintenanceType, AssetStatus
    from app.models.users import AuditLog

    async with db_session_factory() as session:
        transaction = await session.begin()
        try:
            department = Department(code="mapping-dept", name="Mapping test")
            group = AssetGroup(code="mapping-group", name="Mapping group")
            mol = Mol(
                code="mapping-mol",
                department="Mapping department",
                fullName="Mapping MOL",
                storageLocation="Test room",
                departmentRef=department,
            )
            explicit_updated_at = datetime(2024, 3, 2, 1, 2, 3, 456000)
            asset = Asset(
                name="Mapping asset",
                inventoryNumber="mapping-inventory",
                unitPrice=Decimal("12.34"),
                unitOfMeasure="piece",
                quantity=Decimal("2.50"),
                totalCost=Decimal("30.85"),
                mol=mol,
                group=group,
                recordingDate=datetime(2024, 3, 2, 1, 2, 3, 123000),
                documentType="invoice",
                documentDetails="synthetic fixture",
                documentFiles=["synthetic.pdf"],
                photos=None,
                status=AssetStatus.IN_STOCK,
                updatedAt=explicit_updated_at,
            )
            maintenance = AssetMaintenance(
                asset=asset,
                type=AssetMaintenanceType.INSPECTION,
                title="Mapping date fixture",
                scheduledDate=date(2024, 3, 5),
            )
            audit = AuditLog(
                action="MAPPING_TEST",
                entityType="Asset",
                entityId="synthetic",
                details={"source": "mapping test", "attempt": 1},
                requestId="synthetic-mapping-request",
            )
            session.add_all([asset, maintenance, audit])
            await session.flush()
            await session.refresh(asset)
            await session.refresh(maintenance)
            await session.refresh(audit)

            assert re.fullmatch(r"c[a-z0-9]{24}", asset.id)
            assert asset.orderNumber > 0
            assert asset.unitPrice == Decimal("12.34")
            assert asset.quantity == Decimal("2.50")
            assert asset.totalCost == Decimal("30.85")
            assert asset.recordingDate == datetime(2024, 3, 2, 1, 2, 3, 123000)
            assert asset.updatedAt == explicit_updated_at
            assert asset.documentFiles == ["synthetic.pdf"]
            assert asset.photos is None
            assert asset.status is AssetStatus.IN_STOCK
            assert maintenance.scheduledDate == date(2024, 3, 5)
            assert audit.details == {"source": "mapping test", "attempt": 1}
        finally:
            await transaction.rollback()


@pytest.mark.anyio
async def test_read_only_postgres_catalog_matches_metadata(db_engine) -> None:
    from sqlalchemy.dialects.postgresql import dialect

    async with db_engine.connect() as connection:
        await connection.exec_driver_sql("SET TRANSACTION READ ONLY")
        catalog = await connection.run_sync(_read_catalog)

    failures = []
    expected_tables = set(Base.metadata.tables)
    if catalog["tables"] != expected_tables:
        failures.append(
            f"tables: missing={expected_tables - catalog['tables']}, "
            f"extra={catalog['tables'] - expected_tables}"
        )
    counts = INVENTORY["counts"]
    column_count = sum(len(columns) for columns in catalog["columns"].values())
    foreign_key_count = sum(len(fks) for fks in catalog["foreign_keys"].values())
    index_count = sum(len(indexes) for indexes in catalog["indexes"].values())
    check_count = sum(len(checks) for checks in catalog["checks"].values())
    for label, actual, expected in (
        ("columns", column_count, counts["columns"]),
        ("foreign keys", foreign_key_count, counts["foreign_keys"]),
        ("indexes", index_count, counts["indexes"]),
        ("checks", check_count, counts["checks"]),
    ):
        if actual != expected:
            failures.append(f"{label}: catalog={actual}, expected={expected}")
    expected_enums = {enum["sql_name"]: tuple(enum["sql"]["values"]) for enum in INVENTORY["enums"]}
    if catalog["enums"] != expected_enums:
        failures.append(f"enums differ: catalog={catalog['enums']}, expected={expected_enums}")

    pg_dialect = dialect()
    for table_name, table in Base.metadata.tables.items():
        actual_columns = catalog["columns"].get(table_name, {})
        expected_column_names = set(table.columns.keys())
        if set(actual_columns) != expected_column_names:
            failures.append(
                f"{table_name} columns: missing={expected_column_names - set(actual_columns)}, "
                f"extra={set(actual_columns) - expected_column_names}"
            )
        for column_name in expected_column_names & set(actual_columns):
            column = table.columns[column_name]
            actual = actual_columns[column_name]
            if actual["nullable"] is not column.nullable:
                failures.append(f"{table_name}.{column_name} nullable differs")
            actual_type = _normalize_sql(actual["type"])
            expected_type = _normalize_sql(column.type.compile(dialect=pg_dialect))
            if actual_type != expected_type:
                failures.append(
                    f"{table_name}.{column_name} type: catalog={actual_type}, "
                    f"metadata={expected_type}"
                )
            expected_default = (
                str(column.server_default.arg) if column.server_default is not None else None
            )
            if isinstance(column.default, Sequence):
                normalized_default = _normalize_sql(actual["default"])
                sequence = catalog["serial_sequence"]
                actual_sequence_name = sequence.replace('"', "").split(".")[-1]
                if actual_sequence_name != column.default.name:
                    failures.append(
                        f"{table_name}.{column_name} sequence: catalog={sequence}, "
                        f"metadata={column.default.name}"
                    )
                if (
                    normalized_default is None
                    or "nextval(" not in normalized_default
                    or column.default.name not in actual["default"]
                ):
                    failures.append(
                        f"{table_name}.{column_name} SERIAL default differs: "
                        f"catalog={actual['default']}, sequence={sequence}"
                    )
            elif _normalize_sql(actual["default"]) != _normalize_sql(expected_default):
                failures.append(
                    f"{table_name}.{column_name} default: catalog={actual['default']!r}, "
                    f"metadata={expected_default!r}"
                )

        actual_indexes = catalog["indexes"].get(table_name, {})
        expected_index_names = {index.name for index in table.indexes}
        if set(actual_indexes) != expected_index_names:
            failures.append(
                f"{table_name} indexes: missing={expected_index_names - set(actual_indexes)}, "
                f"extra={set(actual_indexes) - expected_index_names}"
            )
        for index in table.indexes:
            if index.name not in actual_indexes:
                continue
            actual = actual_indexes[index.name]
            if actual["unique"] is not index.unique:
                failures.append(f"{table_name}.{index.name} unique differs")
            expected_columns = tuple(
                expression.name
                for expression in index.expressions
                if isinstance(getattr(expression, "name", None), str)
            )
            if expected_columns:
                if actual["columns"] != expected_columns:
                    failures.append(
                        f"{table_name}.{index.name} columns: "
                        f"catalog={actual['columns']}, metadata={expected_columns}"
                    )
            else:
                expressions_match = len(actual["expressions"]) == len(index.expressions) and all(
                    _normalize_sql(actual_expression) == _normalize_sql(str(expected_expression))
                    for actual_expression, expected_expression in zip(
                        actual["expressions"], index.expressions, strict=True
                    )
                )
                if not expressions_match:
                    failures.append(
                        f"{table_name}.{index.name} expressions differ: "
                        f"catalog={actual['expressions']}, "
                        f"metadata={[str(expression) for expression in index.expressions]}"
                    )
            expected_where = index.dialect_options["postgresql"].get("where")
            if _normalize_sql(actual["where"]) != _normalize_sql(expected_where):
                failures.append(
                    f"{table_name}.{index.name} predicate differs: "
                    f"catalog={actual['where']!r}, metadata={str(expected_where)!r}"
                )

        actual_fks = catalog["foreign_keys"].get(table_name, {})
        expected_fk_names = {constraint.name for constraint in table.foreign_key_constraints}
        if set(actual_fks) != expected_fk_names:
            failures.append(
                f"{table_name} foreign keys: missing={expected_fk_names - set(actual_fks)}, "
                f"extra={set(actual_fks) - expected_fk_names}"
            )
        for constraint in table.foreign_key_constraints:
            if constraint.name not in actual_fks:
                continue
            actual = actual_fks[constraint.name]
            expected_targets = tuple(element.target_fullname for element in constraint.elements)
            if actual["columns"] != tuple(column.name for column in constraint.columns):
                failures.append(f"{table_name}.{constraint.name} constrained columns differ")
            if actual["targets"] != expected_targets:
                failures.append(f"{table_name}.{constraint.name} targets differ")
            if actual["ondelete"] != constraint.ondelete:
                failures.append(f"{table_name}.{constraint.name} ondelete differs")
            if actual["onupdate"] != constraint.onupdate:
                failures.append(f"{table_name}.{constraint.name} onupdate differs")

        expected_checks = {
            constraint.name: str(constraint.sqltext)
            for constraint in table.constraints
            if constraint.__class__.__name__ == "CheckConstraint"
        }
        actual_checks = catalog["checks"].get(table_name, {})
        if set(actual_checks) != set(expected_checks):
            failures.append(
                f"{table_name} checks: missing={set(expected_checks) - set(actual_checks)}, "
                f"extra={set(actual_checks) - set(expected_checks)}"
            )
        for name, expression in expected_checks.items():
            if name in actual_checks and _normalize_sql(actual_checks[name]) != _normalize_sql(
                expression
            ):
                failures.append(
                    f"{table_name}.{name} check expression differs: "
                    f"catalog={actual_checks[name]!r}, metadata={expression!r}"
                )

    assert not failures, "PostgreSQL catalog differs from ORM metadata:\n" + "\n".join(failures)


def _read_catalog(connection):
    from sqlalchemy import inspect, text

    inspector = inspect(connection)
    tables = set(inspector.get_table_names(schema="public")) - {
        "_prisma_migrations",
    }
    columns = {}
    indexes = {}
    foreign_keys = {}
    checks = {}
    for table in tables:
        columns[table] = {
            column["name"]: {
                "nullable": column["nullable"],
                "type": column["type"].compile(dialect=connection.dialect),
                "default": column["default"],
            }
            for column in inspector.get_columns(table, schema="public")
        }
        indexes[table] = {
            index["name"]: {
                "columns": tuple(index["column_names"] or ()),
                "expressions": tuple(index.get("expressions") or ()),
                "unique": index["unique"],
                "where": index.get("dialect_options", {}).get("postgresql_where"),
            }
            for index in inspector.get_indexes(table, schema="public")
        }
        foreign_keys[table] = {
            fk["name"]: {
                "columns": tuple(fk["constrained_columns"]),
                "targets": tuple(
                    f"{fk['referred_table']}.{column}" for column in fk["referred_columns"]
                ),
                "ondelete": fk.get("options", {}).get("ondelete"),
                "onupdate": fk.get("options", {}).get("onupdate"),
            }
            for fk in inspector.get_foreign_keys(table, schema="public")
        }
        checks[table] = {
            check["name"]: check["sqltext"]
            for check in inspector.get_check_constraints(table, schema="public")
        }
    enums = {enum["name"]: tuple(enum["labels"]) for enum in inspector.get_enums(schema="public")}
    serial_sequence = connection.execute(
        text("SELECT pg_get_serial_sequence('public.assets', 'orderNumber')")
    ).scalar_one_or_none()
    return {
        "tables": tables,
        "columns": columns,
        "indexes": indexes,
        "foreign_keys": foreign_keys,
        "checks": checks,
        "enums": enums,
        "serial_sequence": serial_sequence,
    }


def _normalize_sql(value) -> str | None:
    if value is None:
        return None

    def canonical_identifier(match: re.Match[str]) -> str:
        token = match.group(0)
        if token.startswith("'"):
            return token
        if token.startswith('"'):
            identifier = token[1:-1].replace('""', '"')
            return identifier if identifier.lower() == identifier else f'"{identifier}"'
        return token.lower()

    normalized = re.sub(
        r"'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|[A-Za-z_][A-Za-z_0-9]*",
        canonical_identifier,
        str(value),
    )
    normalized = re.sub(
        r"::(text|integer|numeric|bigint|smallint|boolean)(\[\])?",
        lambda match: f"::{match.group(1).lower()}{match.group(2) or ''}",
        normalized,
        flags=re.IGNORECASE,
    )
    normalized = re.sub(
        r"('(?:''|[^'])*'|-?\d+(?:\.\d+)?|true|false)\s*::\s*"
        r"(text|integer|numeric|bigint|smallint|boolean)\b",
        r"\1",
        normalized,
        flags=re.IGNORECASE,
    )
    for enum in INVENTORY["enums"]:
        normalized = re.sub(
            rf"('(?:''|[^'])*')\s*::\s*{re.escape(enum['sql_name'])}\b",
            r"\1",
            normalized,
        )

    string_parts = re.split(r"('(?:''|[^'])*')", normalized)
    for index in range(0, len(string_parts), 2):
        string_parts[index] = re.sub(
            r'("[^"]+"|[a-z_][a-z0-9_]*)\s+between\s+'
            r"(-?\d+(?:\.\d+)?)\s+and\s+(-?\d+(?:\.\d+)?)",
            r"\1 >= \2 and \1 <= \3",
            string_parts[index],
        )
    normalized = "".join(string_parts)

    def is_redundant_and_group(match: re.Match[str]) -> str:
        inner = re.sub(r"'(?:''|[^'])*'", "", match.group(1))
        operators = re.findall(r"\b(?:and|or)\b", inner, flags=re.IGNORECASE)
        return match.group(1) if "and" in operators and "or" not in operators else match.group(0)

    normalized = re.sub(r"\(([^()]*)\)\s*(?=or\b)", is_redundant_and_group, normalized)
    normalized = re.sub(r"(?<=or)\s*\(([^()]*)\)", is_redundant_and_group, normalized)
    normalized = re.sub(r"\s+", "", normalized)
    while normalized.startswith("(") and normalized.endswith(")"):
        depth = 0
        encloses_expression = True
        for index, character in enumerate(normalized):
            if character == "(":
                depth += 1
            elif character == ")":
                depth -= 1
                if depth == 0 and index != len(normalized) - 1:
                    encloses_expression = False
                    break
        if not encloses_expression:
            break
        normalized = normalized[1:-1]
    return normalized
