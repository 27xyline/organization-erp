# Stage 12 validation

## Implemented coverage

- Pure reporting aggregation uses Decimal and aggregates a complete authorized result before page slicing. The 137-row fixture checks headcount, active count, occupied rate, planned payroll, and full total.
- Reporting kinds, custom metrics, user-owned presets, dashboard, KPI summaries, and my-actions are implemented behind authenticated Python services/routes. Report SQL uses permission-scoped selection; project finance queries also apply the finance grant's project scope.
- A PostgreSQL integration fixture inserts 137 scoped employees and asserts dashboard headcount/occupied-rate/full aggregate output. It requires `STAGE11_TEST_DATABASE_URL` and checks both the parsed URL and live DB name equal `erp_stage11_test` before metadata setup.
- Search applies predicates in SQL for employees, assets, projects, tasks, and documents and selects only public fields for authorized results. Its PostgreSQL integration fixture inserts hidden examples for all five entities and asserts that forbidden IDs/titles do not occur in result serialization; focused test passed (`1 passed`) against `erp_stage11_test` after fixing the employee/document FK insertion order.
- XLSX, DOCX, PDF and QR renderer tests cover formats, Cyrillic labels/font handling, safe filenames and numeric cells. Report export uses the dashboard's scoped projection, writes audit details, and renders outside the event loop after the read session closes.
- Python CLI entry points exist for explicit demo seeding, relational checks and initial admin creation. CLI services depend on ports; the SQLAlchemy adapters own seed writes and verify queries. The Python demo seed is a small connected department → schedule → employee → project member → task assignee dataset, guarded against production/working/remote DBs and inserts with `ON CONFLICT DO NOTHING`. Startup does not seed. `create-admin` still uses `getpass` and service-owned user/audit writes.
- The complete training fixture remains in `prisma/demo-seed.ts`: Python does not yet reproduce all ten departments, 40 employees, 24 projects, 20 assets, demo role users, procurement cases, or document fixtures.
- Root dashboard and reports SSR use authenticated backend fetches. Report Next handlers retain their URLs and validation and proxy to Python. Binary export uses a FastAPI response and BFF `forwardedResponse` path.
- `backend/app/scripts/reporting_baseline.py` fixes target DB (`erp_stage11_test`), ADMIN scope, 2026 calendar year, null department/project filters and 10 iterations for dashboard and turnover. The latest parent-authorized read-only run measured 13 SQL statements per dashboard query, median 10.04 ms (min 8.99, max 60.71); turnover used 2 SQL statements per query, median 2.35 ms (min 2.05, max 4.98). The observed row counts were: departments 17, employees 0, staff_schedule 0, salary_entries 0, finance_plan_entries 0, projects 14, tasks 0, assets 16, vacations 0, personnel_actions 0. These are a baseline sample, not a latency guarantee. The script checked `current_database()` and printed the table counts before timing.

## Completed non-database checks

- Focused Ruff check/format: passed.
- Focused mypy: 20 files, passed.
- Non-DB Python Stage12 tests: 9 passed.
- Search/report BFF Vitest: 4 passed.
- Focused ESLint: zero errors after removing an unused catch variable.
- Frontend `npm run typecheck`: passed.
- Mapper regression for the `verify_data` CLI passes without a database; see `tests/unit/scripts/test_verify_data_registry.py`.
- `tests/unit/scripts/test_cli_ports.py` checks port delegation, SQL-free service imports, conflict-safe insert SQL, the connected seed links, and production/working/remote-target guards.

## Database test evidence

The parent-authorized Stage12 suite ran against `erp_stage11_test`: `10 passed, 1 failed`. The only failure was the all-entity search-scope fixture: its hidden document referenced `s12-hidden-employee` before that employee row had been flushed. The fixture now inserts/flushed both employees before creating the document. Focused rerun:

```sh
cd backend
set -a; source ../.runtime/stage11/test.env; set +a
UV_CACHE_DIR=/private/tmp/uv-stage12 uv run pytest tests/integration/search/test_search_scopes.py::test_search_hides_scoped_employee_asset_project_task_and_document_fields -q
```

Result: `1 passed`. The full suite was not repeated.

## Remaining gates

The full authorized Stage12 suite returned `10 passed, 1 failed`; after fixing its single fixture-ordering issue, the exact failed test was rerun and passed. The full suite was not repeated. An earlier parent-authorized read-only `verify_data` run against `erp_stage11_test`, with the isolated URL passed explicitly into `Settings()`, returned `holdingMismatch=0`, `orphanHoldings=0`, `documentCurrentVersionMismatch=21`, `negativeAssets=0`, `negativeHoldings=0`, `secretAuditRows=0` and exit code 1. A second read-only query found `documents=21`, `document_versions=0`, `mismatches=21`, and `documents_with_any_version=0`; the origin of those rows is unknown and no rows were changed. This is not a passing integrity check. The CLI was subsequently refactored behind ports, so its final adapter still needs a DB-backed run. The isolated URL must be passed explicitly into `Settings()` (it does not read `STAGE11_TEST_DATABASE_URL` itself):

```sh
cd backend
set -a; source ../.runtime/stage11/test.env; set +a
BACKEND_DATABASE_URL="$STAGE11_TEST_DATABASE_URL" UV_CACHE_DIR=/private/tmp/uv-stage12 uv run python -m app.scripts.verify_data
UV_CACHE_DIR=/private/tmp/uv-stage12 uv run python -m app.scripts.reporting_baseline
```

The baseline script reads `STAGE11_TEST_DATABASE_URL` directly. Its final version checks `current_database()`, prints the row-count snapshot above, then measures the fixed query set. Do not use `project1` or perform cleanup/DROP/truncate.

The Stage 12 browser flow is `e2e/stage12-reporting.spec.ts`; it covers dashboard SSR, global search, a report request, XLSX download and PDF status/headers/signature. It targets `erp_stage09_e2e` from `.runtime/stage09/e2e.env`. Initial attempt found FastAPI route registration rejected the custom-report return union; `response_model=None` fixed startup. On the focused retry the backend started, but global setup could not connect to `127.0.0.1:5434`, so the browser test did not run. No Docker/container lifecycle command was used.

The broader full `npm run lint` attempt from checkpoint reported 656 existing/generated findings, including `.runtime/migration-baseline`; changed-file ESLint passes.

The final CLI service/adapter separation and seed link graph have focused no-database checks only. No demo seed or verify-data run was performed after the port refactor, so DB-backed insertion order, idempotence across repeated CLI invocations, and current-adapter relational verification remain unverified; the Stage 12 CLI acceptance checkbox stays unchecked. The earlier verify-data result above records the test snapshot's observed document inconsistency, not a pass for the final adapter.
