"""Fixed-window SQL-count/latency measurement for an explicitly selected test DB."""

from __future__ import annotations

import asyncio
import json
import os
import statistics
import time
from datetime import date, datetime
from typing import Any
from urllib.parse import urlsplit

from sqlalchemy import event, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.registry import (
    Asset,
    Department,
    Employee,
    FinancePlanEntry,
    PersonnelAction,
    Project,
    SalaryEntry,
    StaffSchedule,
    Task,
    Vacation,
)
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.services.dashboard import DashboardService
from app.services.dto.reporting import DashboardQuery
from app.services.reporting import ReportingService

ITERATIONS = 10
FILTERS = DashboardQuery(date(2026, 1, 1), date(2026, 12, 31))
DATASET_MODELS: tuple[tuple[str, Any], ...] = (
    ("departments", Department),
    ("employees", Employee),
    ("staff_schedule", StaffSchedule),
    ("salary_entries", SalaryEntry),
    ("finance_plan_entries", FinancePlanEntry),
    ("projects", Project),
    ("tasks", Task),
    ("assets", Asset),
    ("vacations", Vacation),
    ("personnel_actions", PersonnelAction),
)


async def main() -> None:
    raw = os.environ.get("STAGE11_TEST_DATABASE_URL")
    if not raw or urlsplit(raw).path.removeprefix("/") != "erp_stage11_test":
        raise RuntimeError(
            "Set STAGE11_TEST_DATABASE_URL to the isolated erp_stage11_test database"
        )
    engine = create_async_engine(raw, hide_parameters=True)
    measurements: list[float] = []
    query_count = 0
    report_measurements: list[float] = []
    dashboard_query_count = 0
    report_query_count = 0

    def count_query(*_: object) -> None:
        nonlocal query_count
        query_count += 1

    listener_registered = False
    access = AccessContext(
        "stage12-baseline", None, None, (), (ScopeGrant("baseline-admin", "ADMIN", "ALL", "ALL"),)
    )
    try:
        factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
            engine, expire_on_commit=False
        )
        async with factory() as session:
            database_name = await session.scalar(text("SELECT current_database()"))
            if database_name != "erp_stage11_test":
                raise RuntimeError("Baseline connected to a non-test database")
            dataset_counts = {
                table: int(await session.scalar(select(func.count()).select_from(model)) or 0)
                for table, model in DATASET_MODELS
            }
        print(f"dataset_database={database_name}")
        print(f"dataset_row_counts={json.dumps(dataset_counts, sort_keys=True)}")

        event.listen(engine.sync_engine, "before_cursor_execute", count_query)
        listener_registered = True
        reports = ReportingService(factory)
        for _ in range(ITERATIONS):
            before_count = query_count
            started = time.perf_counter()
            async with factory() as session:
                await DashboardService(session).get_overview(FILTERS, access)
            measurements.append((time.perf_counter() - started) * 1000)
            dashboard_iteration_queries = query_count - before_count
            dashboard_query_count += dashboard_iteration_queries
            print(f"dashboard_iteration_sql={dashboard_iteration_queries}")
            before_count = query_count
            started = time.perf_counter()
            await reports.turnover(
                datetime(2026, 1, 1),
                datetime(2026, 12, 31, 23, 59, 59),
                None,
                access,
            )
            report_measurements.append((time.perf_counter() - started) * 1000)
            report_iteration_queries = query_count - before_count
            report_query_count += report_iteration_queries
            print(f"report_iteration_sql={report_iteration_queries}")
        print(f"iterations={ITERATIONS} period=2026 departmentId=null projectId=null")
        print(
            f"dashboard_sql_total={dashboard_query_count} "
            f"latency_median_ms={statistics.median(measurements):.2f} "
            f"latency_min_ms={min(measurements):.2f} "
            f"latency_max_ms={max(measurements):.2f}"
        )
        print(
            f"turnover_sql_total={report_query_count} iterations={ITERATIONS} "
            f"latency_median_ms={statistics.median(report_measurements):.2f} "
            f"latency_min_ms={min(report_measurements):.2f} "
            f"latency_max_ms={max(report_measurements):.2f}"
        )
    finally:
        if listener_registered:
            event.remove(engine.sync_engine, "before_cursor_execute", count_query)
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
