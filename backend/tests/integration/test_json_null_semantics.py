from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import JSON

from app.db.registry import AuditLog


@pytest.mark.anyio
async def test_nullable_jsonb_distinguishes_sql_null_json_null_and_nested_null(
    db_session_factory,
) -> None:
    suffix = uuid4().hex
    entity_ids = {
        "omitted": f"{suffix}-omitted",
        "python_none": f"{suffix}-python-none",
        "json_null": f"{suffix}-json-null",
        "nested_null": f"{suffix}-nested-null",
    }

    async with db_session_factory() as session:
        transaction = await session.begin()
        try:
            logs = [
                AuditLog(
                    action="JSON_NULL_MAPPING_TEST",
                    entityType="MappingTest",
                    entityId=entity_ids["omitted"],
                ),
                AuditLog(
                    action="JSON_NULL_MAPPING_TEST",
                    entityType="MappingTest",
                    entityId=entity_ids["python_none"],
                    details=None,
                ),
                AuditLog(
                    action="JSON_NULL_MAPPING_TEST",
                    entityType="MappingTest",
                    entityId=entity_ids["json_null"],
                    details=JSON.NULL,
                ),
                AuditLog(
                    action="JSON_NULL_MAPPING_TEST",
                    entityType="MappingTest",
                    entityId=entity_ids["nested_null"],
                    details={"nested": None},
                ),
            ]
            session.add_all(logs)
            await session.flush()

            sql_null_ids = set(
                await session.scalars(
                    select(AuditLog.entityId)
                    .where(AuditLog.entityId.in_(entity_ids.values()))
                    .where(AuditLog.details.is_(None))
                )
            )
            json_null_ids = set(
                await session.scalars(
                    select(AuditLog.entityId)
                    .where(AuditLog.entityId.in_(entity_ids.values()))
                    .where(AuditLog.details == JSON.NULL)
                )
            )
            nested = await session.scalar(
                select(AuditLog.details).where(AuditLog.entityId == entity_ids["nested_null"])
            )

            assert sql_null_ids == {entity_ids["omitted"], entity_ids["python_none"]}
            assert json_null_ids == {entity_ids["json_null"]}
            assert nested == {"nested": None}
        finally:
            await transaction.rollback()
