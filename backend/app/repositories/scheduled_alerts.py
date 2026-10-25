"""PostgreSQL advisory lock and run-state persistence for scheduled alerts."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker


class SqlAlchemyScheduledAlertLock:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    @asynccontextmanager
    async def hold(self) -> AsyncIterator[object | None]:
        """Keep a dedicated PG connection only while the generator runs."""
        async with self._engine.connect() as connection:
            acquired = bool(
                await connection.scalar(
                    text("SELECT pg_try_advisory_lock(hashtext('scheduled-alerts'))")
                )
            )
            if not acquired:
                yield None
                return
            try:
                yield connection
            finally:
                await connection.execute(
                    text("SELECT pg_advisory_unlock(hashtext('scheduled-alerts'))")
                )
                await connection.commit()

    async def state(self, connection: object) -> tuple[datetime | None, datetime | None]:
        row = (
            await connection.execute(  # type: ignore[attr-defined]
                text(
                    'SELECT "lastStartedAt", "lastSucceededAt" FROM "scheduled_alert_runs" '
                    "WHERE \"key\" = 'scheduled-alerts'"
                )
            )
        ).first()
        return (row[0], row[1]) if row else (None, None)

    async def started(self, connection: object, now: datetime) -> None:
        await connection.execute(  # type: ignore[attr-defined]
            text(
                """INSERT INTO "scheduled_alert_runs" ("key", "lastStartedAt", "updatedAt")
                   VALUES ('scheduled-alerts', :now, :now)
                   ON CONFLICT ("key") DO UPDATE SET "lastStartedAt" = :now, "updatedAt" = :now"""
            ),
            {"now": now},
        )
        await connection.commit()  # type: ignore[attr-defined]

    async def succeeded(self, connection: object, now: datetime) -> None:
        await connection.execute(  # type: ignore[attr-defined]
            text(
                """UPDATE "scheduled_alert_runs" SET "lastSucceededAt" = :now,
                   "lastError" = NULL, "updatedAt" = :now WHERE "key" = 'scheduled-alerts'"""
            ),
            {"now": now},
        )
        await connection.commit()  # type: ignore[attr-defined]

    async def failed(self, connection: object, now: datetime, error: str) -> None:
        await connection.execute(  # type: ignore[attr-defined]
            text(
                """UPDATE "scheduled_alert_runs" SET "lastError" = :error, "updatedAt" = :now
                   WHERE "key" = 'scheduled-alerts'"""
            ),
            {"now": now, "error": error[:1000]},
        )
        await connection.commit()  # type: ignore[attr-defined]


class SqlAlchemyScheduledAlertQueries:
    """SQLAlchemy adapter for legacy scheduled-alert source and reminder queries."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def _rows(self, sql: str, **params: object) -> list[dict[str, Any]]:
        async with self._session_factory() as session:
            result = await session.execute(text(sql), params)
            return [dict(row) for row in result.mappings().all()]

    async def contracts(self, start_day: datetime, end_30: datetime) -> list[dict[str, Any]]:
        return await self._rows(
            """SELECT e."id", e."fullName", e."contractEndDate", u."id" AS "userId"
               FROM "employees" e JOIN "users" u ON u."employeeId" = e."id"
               WHERE e."status" <> 'DISMISSED' AND u."isActive"
                 AND e."contractEndDate" >= :start_day AND e."contractEndDate" <= :end_30""",
            start_day=start_day,
            end_30=end_30,
        )

    async def overdue_tasks(self, start_day: datetime) -> list[dict[str, Any]]:
        return await self._rows(
            """SELECT t."id", t."name", t."endDate", t."projectId", u."id" AS "userId"
               FROM "tasks" t JOIN "task_assignees" ta ON ta."taskId" = t."id"
               JOIN "employees" e ON e."id" = ta."employeeId"
               JOIN "users" u ON u."employeeId" = e."id" AND u."isActive"
               WHERE t."endDate" < :start_day AND t."status" <> 'COMPLETED' """,
            start_day=start_day,
        )

    async def assets_for_disposal(
        self, start_day: datetime, end_30: datetime
    ) -> list[dict[str, Any]]:
        return await self._rows(
            """SELECT a."id", a."name", a."inventoryNumber", a."plannedDisposalDate",
                      m."departmentId"
               FROM "assets" a JOIN "mols" m ON m."id" = a."molId"
               WHERE NOT a."isArchived" AND a."plannedDisposalDate" >= :start_day
                 AND a."plannedDisposalDate" <= :end_30""",
            start_day=start_day,
            end_30=end_30,
        )

    async def users_in_scope(self, role: str, scope_kind: str, scope_id: str) -> tuple[str, ...]:
        if scope_kind == "department":
            sql = """SELECT DISTINCT u."id" FROM "users" u
              JOIN "user_role_assignments" a ON a."userId" = u."id"
              LEFT JOIN "user_department_scopes" s ON s."roleAssignmentId" = a."id"
              WHERE u."isActive" AND a."role" IN ('ADMIN', :role)
                AND (a."departmentScopeMode" = 'ALL' OR
                  (a."departmentScopeMode" = 'ASSIGNED' AND s."departmentId" = :scope_id))"""
        else:
            sql = """SELECT DISTINCT u."id" FROM "users" u
              JOIN "user_role_assignments" a ON a."userId" = u."id"
              LEFT JOIN "user_project_scopes" s ON s."roleAssignmentId" = a."id"
              WHERE u."isActive" AND a."role" IN ('ADMIN', :role)
                AND (a."projectScopeMode" = 'ALL' OR
                  (a."projectScopeMode" = 'ASSIGNED' AND s."projectId" = :scope_id))"""
        rows = await self._rows(sql, role=role, scope_id=scope_id)
        return tuple(sorted(str(row["id"]) for row in rows))

    async def over_budget_projects(self) -> list[dict[str, Any]]:
        return await self._rows(
            '''SELECT p."id", p."code", p."name", p."updatedAt"
               FROM "projects" p WHERE p."status" = 'ACTIVE' AND p."plannedBudget" > 0
                 AND p."actualBudget" > p."plannedBudget"'''
        )

    async def maintenance(self, start_30: datetime, end_30: datetime) -> list[dict[str, Any]]:
        return await self._rows(
            """SELECT am."id", am."title", am."scheduledDate", a."id" AS "assetId",
                 a."name" AS "assetName", a."inventoryNumber", m."departmentId"
               FROM "asset_maintenance" am JOIN "assets" a ON a."id" = am."assetId"
               JOIN "mols" m ON m."id" = a."molId"
               WHERE am."status" IN ('PLANNED', 'IN_PROGRESS') AND NOT a."isArchived"
                 AND am."scheduledDate" >= :start_30 AND am."scheduledDate" <= :end_30""",
            start_30=start_30,
            end_30=end_30,
        )

    async def approval_reminders(self, end_1: datetime) -> list[dict[str, Any]]:
        return await self._rows(
            '''SELECT s."id", s."approverId", s."dueDate", r."id" AS "requestId",
                 r."title" AS "requestTitle" FROM "approval_steps" s
               JOIN "approval_requests" r ON r."id" = s."requestId"
               WHERE s."status" = 'PENDING' AND s."dueDate" <= :end_1 AND NOT s."reminderSent"''',
            end_1=end_1,
        )

    async def mark_approval_reminder_sent(self, step_id: str) -> None:
        async with self._session_factory() as session:
            await session.execute(
                text(
                    'UPDATE "approval_steps" SET "reminderSent" = true '
                    'WHERE "id" = :id AND "status" = \'PENDING\' '
                    'AND NOT "reminderSent"'
                ),
                {"id": step_id},
            )
            await session.commit()
