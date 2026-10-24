# Stage 12 validation

## Implemented coverage

- Pure reporting aggregation uses Decimal and aggregates a complete authorized result before page slicing. The 137-row fixture checks headcount, active count, occupied rate, planned payroll, and full total.
- Reporting kinds, custom metrics, user-owned presets, dashboard, KPI summaries, and my-actions are implemented behind authenticated Python services/routes. Report SQL uses permission-scoped selection; project finance queries also apply the finance grant's project scope.
- A PostgreSQL integration fixture inserts 137 scoped employees and asserts dashboard headcount/occupied-rate/full aggregate output. It requires `STAGE11_TEST_DATABASE_URL` and checks both the parsed URL and live DB name equal `erp_stage11_test` before metadata setup.
- Search applies predicates in SQL for employees, assets, projects, tasks, and documents and selects only public fields for authorized results. Its PostgreSQL integration fixture now inserts hidden examples for all five entities and asserts that forbidden IDs/titles do not occur in the result serialization; this DB test remains unexecuted pending the parent-approved connection.
- XLSX, DOCX, PDF and QR renderer tests cover formats, Cyrillic labels/font handling, safe filenames and numeric cells. Report export uses the dashboard's scoped projection, writes audit details, and renders outside the event loop after the read session closes.
- Python CLI entry points exist for explicit demo seeding, relational checks and initial admin creation. Seed target guards, idempotence, no startup seeding, `getpass` and service-owned user/audit writes are implemented.
- Root dashboard and reports SSR use authenticated backend fetches. Report Next handlers retain their URLs and validation and proxy to Python. Binary export uses a FastAPI response and BFF `forwardedResponse` path.
- `backend/app/scripts/reporting_baseline.py` fixes target DB, role, date period, filters and 10 iterations for dashboard and turnover. The script emits each iteration's SQL count and summary latency; actual measurements are pending permitted DB access.

## Completed non-database checks

- Focused Ruff check/format: passed.
- Focused mypy: 20 files, passed.
- Non-DB Python Stage12 tests: 9 passed.
- Search/report BFF Vitest: 4 passed.
- Focused ESLint: zero errors after removing an unused catch variable.
- Frontend `npm run typecheck`: passed.

## Pending database and browser gates

The parent has deferred DB access until an exact elevated invocation is approved. No DB connection was attempted in this follow-up. Once approved, run:

```sh
cd backend
uv run pytest tests/unit/reporting tests/integration/reporting tests/contracts/reporting tests/integration/search tests/integration/exports -q
```

Then run `uv run python -m app.scripts.verify_data` and `uv run python -m app.scripts.reporting_baseline` with `STAGE11_TEST_DATABASE_URL` set only to the isolated `erp_stage11_test`; retain the resulting counts/latencies and add them here. Do not use `project1` or perform cleanup/DROP/truncate.

Playwright was attempted as `npm run test:e2e -- --list`. Playwright config stopped before test discovery because `STAGE07_E2E_DATABASE_URL` (or its compatibility variable) is unset. A browser flow was not run. The prior checkpoint's direct search-test connection failed before SQL with `PermissionError: [Errno 1] Operation not permitted` against `127.0.0.1:55432`; no Docker/container lifecycle command was used.

The broader full `npm run lint` attempt from checkpoint reported 656 existing/generated findings, including `.runtime/migration-baseline`; changed-file ESLint passes.
