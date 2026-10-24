# Stage 12 validation

## Implemented coverage

- Pure reporting aggregation uses Decimal and aggregates a complete authorized result before page slicing. The 137-row fixture checks headcount, active count, occupied rate, planned payroll, and full total.
- Reporting kinds, custom metrics, user-owned presets, dashboard, KPI summaries, and my-actions are implemented behind authenticated Python services/routes. Report SQL uses permission-scoped selection; project finance queries also apply the finance grant's project scope.
- A PostgreSQL integration fixture inserts 137 scoped employees and asserts dashboard headcount/occupied-rate/full aggregate output. It requires `STAGE11_TEST_DATABASE_URL` and checks both the parsed URL and live DB name equal `erp_stage11_test` before metadata setup.
- Search applies predicates in SQL for employees, assets, projects, tasks, and documents and selects only public fields for authorized results. Its PostgreSQL integration fixture inserts hidden examples for all five entities and asserts that forbidden IDs/titles do not occur in result serialization; focused test passed (`1 passed`) against `erp_stage11_test` after fixing the employee/document FK insertion order.
- XLSX, DOCX, PDF and QR renderer tests cover formats, Cyrillic labels/font handling, safe filenames and numeric cells. Report export uses the dashboard's scoped projection, writes audit details, and renders outside the event loop after the read session closes.
- Python CLI entry points exist for explicit demo seeding, relational checks and initial admin creation. Seed target guards, idempotence, no startup seeding, `getpass` and service-owned user/audit writes are implemented.
- Root dashboard and reports SSR use authenticated backend fetches. Report Next handlers retain their URLs and validation and proxy to Python. Binary export uses a FastAPI response and BFF `forwardedResponse` path.
- `backend/app/scripts/reporting_baseline.py` fixes target DB (`erp_stage11_test`), ADMIN scope, 2026 calendar year, null department/project filters and 10 iterations for dashboard and turnover. The measured baseline was 13 SQL statements per dashboard query (130 total), median 9.44 ms (min 8.13, max 148.80); turnover used 2 SQL statements per query (20 total), median 2.01 ms (min 1.88, max 7.10). These are a baseline sample, not a latency guarantee. The script checks `current_database()` and prints row counts for ten relevant tables before timing. The final row-count snapshot is pending the parent-approved read-only rerun.

## Completed non-database checks

- Focused Ruff check/format: passed.
- Focused mypy: 20 files, passed.
- Non-DB Python Stage12 tests: 9 passed.
- Search/report BFF Vitest: 4 passed.
- Focused ESLint: zero errors after removing an unused catch variable.
- Frontend `npm run typecheck`: passed.
- Mapper regression for the `verify_data` CLI passes without a database; see `tests/unit/scripts/test_verify_data_registry.py`.

## Database test evidence

The parent-authorized Stage12 suite ran against `erp_stage11_test`: `10 passed, 1 failed`. The only failure was the all-entity search-scope fixture: its hidden document referenced `s12-hidden-employee` before that employee row had been flushed. The fixture now inserts/flushed both employees before creating the document. Focused rerun:

```sh
cd backend
set -a; source ../.runtime/stage11/test.env; set +a
UV_CACHE_DIR=/private/tmp/uv-stage12 uv run pytest tests/integration/search/test_search_scopes.py::test_search_hides_scoped_employee_asset_project_task_and_document_fields -q
```

Result: `1 passed`. The full suite was not repeated.

## Remaining gates

The full authorized Stage12 suite returned `10 passed, 1 failed`; after fixing its single fixture-ordering issue, the exact failed test was rerun and passed. The full suite was not repeated. The CLI mapper regression is a local no-database test. Verify-data itself has not yet been rerun; its isolated URL must be passed explicitly into `Settings()` (it does not read `STAGE11_TEST_DATABASE_URL` itself):

```sh
cd backend
set -a; source ../.runtime/stage11/test.env; set +a
BACKEND_DATABASE_URL="$STAGE11_TEST_DATABASE_URL" UV_CACHE_DIR=/private/tmp/uv-stage12 uv run python -m app.scripts.verify_data
UV_CACHE_DIR=/private/tmp/uv-stage12 uv run python -m app.scripts.reporting_baseline
```

The baseline script reads `STAGE11_TEST_DATABASE_URL` directly. Its final version first checks `current_database()`, prints a row-count snapshot for ten reporting/dashboard tables, then measures the fixed query set. Parent will capture those counts and final run output after this commit. Do not use `project1` or perform cleanup/DROP/truncate.

The Stage 12 browser flow is `e2e/stage12-reporting.spec.ts`; it covers dashboard SSR, global search, a report request, XLSX download and PDF status/headers/signature. It targets `erp_stage09_e2e` from `.runtime/stage09/e2e.env`. Initial attempt found FastAPI route registration rejected the custom-report return union; `response_model=None` fixed startup. On the focused retry the backend started, but global setup could not connect to `127.0.0.1:5434`, so the browser test did not run. No Docker/container lifecycle command was used.

The broader full `npm run lint` attempt from checkpoint reported 656 existing/generated findings, including `.runtime/migration-baseline`; changed-file ESLint passes.
