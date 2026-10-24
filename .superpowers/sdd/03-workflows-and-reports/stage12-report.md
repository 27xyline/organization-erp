# Stage 12 implementation report

## Status

Stage 12 implementation is in place, but DB-backed acceptance remains pending the parent-approved run against isolated `erp_stage11_test`. No Stage 13 work, Docker lifecycle commands, production database access, or `project1` access occurred. The pre-existing user-owned `next-env.d.ts` edit remains unchanged and excluded.

## Implementation

- Added reporting port/DTOs, SQLAlchemy repository, reporting/dashboard/my-actions services, report routes and schemas for turnover, profitability, depreciation, vacation calendar, custom reports and user-owned presets. KPI/report calculations use full scoped results before result shaping; custom/profitability report finance queries include project scope.
- Added dashboard and my-actions SQL projections. Added a PostgreSQL integration fixture with 137 employees to verify dashboard totals. Existing pure aggregation fixture checks 137 records and paging semantics.
- Search remains Python-owned for employee, asset, project, task and document entities, with scope predicates in SQL and narrow result projections. Its DB integration fixture now inserts hidden examples of each entity and checks that IDs/titles do not leak through result serialization.
- Connected report exports to the scoped dashboard projection; XLSX/DOCX/PDF render after the read session closes and run via `asyncio.to_thread`. Export audit records include format and filters. The binary response sets 200, attachment filename, `Cache-Control: no-store`, and `X-Content-Type-Options: nosniff`.
- Cut over root dashboard and reports SSR and reports BFF paths to FastAPI. `rg` found no remaining production imports of report/dashboard/my-actions TypeScript services or Prisma in these SSR/BFF paths.
- Added explicit Python `seed`, `verify_data`, `create_admin`, and `reporting_baseline` commands. Seed is idempotent for demo departments, refuses production, known working DB names and non-local hosts; app startup never seeds. Admin bootstrap calls `UserService`, hashes with Argon2, writes an audit record in the same UoW and reads the password with `getpass`.
- Added `stage12-ownership.md` as the API ownership registry and updated validation evidence. Stage plan boxes remain unchecked because the DB-backed and full Playwright gates have not completed.

## Validation

- Ruff check and format check: passed for changed Stage 12 Python modules/tests.
- Focused mypy: passed, 20 source files.
- Non-DB Python tests: `9 passed` (reporting unit, preset contract, export renderers, and pure aggregation-window fixture).
- Search/report BFF Vitest: `4 passed`.
- Focused ESLint on changed SSR/BFF files: zero errors; an unused catch binding warning was then removed.
- `npm run typecheck`: passed.
- Added `tests/unit/scripts/test_verify_data_registry.py`; its no-DB mapper regression passed (`1 passed`). `verify_data.py` imports `app.db.registry`, which configures the complete mapping set before the verification service touches Asset and related mappers.
- The Stage 12 Playwright flow is `e2e/stage12-reporting.spec.ts`; it covers dashboard SSR, global search, a report request, XLSX download and PDF status/headers/signature. The authorized target was isolated `erp_stage09_e2e` from `.runtime/stage09/e2e.env`. The first launch found and fixed a FastAPI response-model annotation error; on retry FastAPI started but E2E global setup could not connect to `127.0.0.1:5434`, so no browser assertions ran. No Docker lifecycle actions were performed.
- The parent-authorized full pytest command ran against `erp_stage11_test`: `10 passed, 1 failed`. The sole failure was a fixture FK ordering bug: a document was inserted before its hidden employee. Employees are now inserted and flushed first; the exact focused integration test then passed (`1 passed`). The full suite was not repeated. Python `verify_data` remains unrun; its documented command now maps `STAGE11_TEST_DATABASE_URL` to `BACKEND_DATABASE_URL` so `Settings()` cannot fall back to `organization_erp`.
- `reporting_baseline.py` defines a fixed target (`erp_stage11_test`), ADMIN scope, 2026 calendar year, null department/project filters and ten iterations. Measured baseline: dashboard 13 SQL/query, median 9.44 ms (8.13–148.80); turnover 2 SQL/query, median 2.01 ms (1.88–7.10). The script now emits row counts for all relevant dashboard/report input tables; the final row-count snapshot will be appended after the parent's read-only rerun.
- The earlier full repository lint attempt at checkpoint found 656 pre-existing/generated findings, including `.runtime/migration-baseline`; focused changed-file lint is clean.

## Files

The second Stage 12 commit contains explicit Stage 12 Python API/services/repository/CLI/test files, affected reports BFF and SSR files, `stage12-ownership.md`, `stage12-validation.md`, this report, and the SDD progress ledger. It excludes `next-env.d.ts`.

## Remaining acceptance gate

The exact requested Stage 12 pytest selection returned `10 passed, 1 failed`; the only failed integration case was repaired and its focused rerun passed. Do not repeat the full suite. `verify_data` must receive `BACKEND_DATABASE_URL="$STAGE11_TEST_DATABASE_URL"` after sourcing the isolated test env. The Stage 12 Playwright flow uses only the isolated `erp_stage09_e2e` target from `.runtime/stage09/e2e.env`. Update plan checkboxes only where evidence is available. Stop before Stage 13.
