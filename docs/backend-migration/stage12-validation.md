# Stage 12 validation

## Implemented coverage

- Pure reporting aggregation uses Decimal and aggregates a complete authorized result before page slicing. The 137-row fixture checks headcount, active count, occupied rate, planned payroll, and full total.
- Reporting kinds, custom metrics, user-owned presets, dashboard, KPI summaries, and my-actions are implemented behind authenticated Python services/routes. Report SQL uses permission-scoped selection; project finance queries also apply the finance grant's project scope.
- A PostgreSQL integration fixture inserts 137 scoped employees and asserts dashboard headcount/occupied-rate/full aggregate output. It requires `STAGE11_TEST_DATABASE_URL` and checks both the parsed URL and live DB name equal `erp_stage11_test` before metadata setup.
- Search applies predicates in SQL for employees, assets, projects, tasks, and documents and selects only public fields for authorized results. Its PostgreSQL integration fixture inserts hidden examples for all five entities and asserts that forbidden IDs/titles do not occur in result serialization; focused test passed (`1 passed`) against `erp_stage11_test` after fixing the employee/document FK insertion order.
- XLSX, DOCX, PDF and QR renderer tests cover formats, Cyrillic labels/font handling, safe filenames and numeric cells. Report export uses the dashboard's scoped projection, writes audit details, and renders outside the event loop after the read session closes.
- The public `npm run db:seed`, `db:verify`, and `user:create-admin` commands use `scripts/backend-cli.mjs` to load root `.env`, map `DATABASE_URL`/`NODE_ENV` to backend settings without printing values, and invoke the Python CLI with `uv`. Explicit Python entrypoints use domain services and ports. Seed is a small connected department → schedule → employee → project member → task assignee graph, idempotent and guarded against production, working DB names and non-local hosts; startup does not seed. Admin creation still uses `getpass` and service-owned user/audit writes.
- Python `db:verify` retains all 11 legacy relational counters: holding mismatch, negative assets/holdings, orphan asset/MOL holdings, secret audit patterns, department cycles, duplicate codes/names, department snapshot mismatch, current-version mismatch and unsafe document metadata. It also verifies every stored document file's existence, byte size and SHA-256 using the existing `StoragePort`/`LocalDocumentStorage.get` adapter. The broad legacy TypeScript demo fixture is no longer the public seed command and is not reproduced by Python.
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
- `node --test scripts/backend-cli.test.mjs` checks root npm env-file configuration, environment mapping/precedence, safe command dispatch and all three Python modules without a DB.

## Final isolated acceptance — 2026-10-24

The final checks used a disposable `postgres:18.6-alpine` container mapped to `127.0.0.1:5434`, launched with `--rm` and without a named or bind-mounted volume. The image's anonymous PGDATA volume was removed with the container after testing. It contained separate `erp_stage11_test`, `erp_stage12_seed_test` and `erp_stage09_e2e` databases. Prisma applied all 41 migrations to the seed and E2E databases.

The planned backend selection completed on the isolated `erp_stage11_test` database:

```sh
.venv/bin/pytest tests/unit/reporting tests/integration/reporting tests/contracts/reporting tests/integration/search tests/integration/exports -q
```

Result: `21 passed`. This includes the 137-employee aggregate fixture, PostgreSQL search-scope coverage for employee/asset/project/task/document, export renderers, the dashboard department-filter regression and route response contracts.

The public CLI launcher suite completed with `4 passed`. A live invocation of `npm run db:seed` created one department, schedule, employee, project, membership, task and assignee plus seven training records. Its second invocation reported zero newly created records. `npm run db:verify` exited 0; all twelve relational and file-integrity counters were zero.

`npm run test:e2e -- e2e/stage12-reporting.spec.ts` completed with `1 passed`. It exercised dashboard SSR, global search, the turnover report request, XLSX download, and PDF status, headers and signature.

These checks exposed and fixed three runtime gaps: the public launcher now runs Python from `backend/`; the dashboard asset/MOL department `EXISTS` query explicitly correlates only `Asset`; and `/api/dashboard` plus `/api/my-actions` now return the `{data: ...}` envelope consumed by SSR. Focused tests cover the launcher path, SQL correlation and both route response contracts. Ruff and formatting checks passed on changed backend files.

The earlier read-only snapshot from the pre-existing `erp_stage11_test` database reported 21 documents without versions (`documentCurrentVersionMismatch=21`). Those unknown rows were not changed; the final zero-counter result comes from the new clean disposable database. The earlier 10/1, 17/2 and Playwright connection failures were superseded by the passing final runs above.

During this Docker window, read-only event history showed the pre-existing `erp-stage10-pg18-test` container on `55432` paused, killed with exit 137, removed, and its anonymous volume destroyed at 15:51 UTC. Redis, Grafana and Prometheus in `real-crm-project` received SIGTERM at the same time; Kafdrop exited with code 1. No command issued for this Stage 12 task targeted those containers or volumes, so the cause is unknown. I did not recreate the Stage 10 database or restart the unrelated project services; a blank replacement would not restore their prior data/state. Docker Desktop itself remained running.

The previously recorded reporting baseline remains the earlier 10-iteration sample against its named isolated database. It is not a measurement from the new empty acceptance database or a latency guarantee. Frontend typecheck and focused ESLint checks passed earlier; no frontend source was changed during final acceptance. The broad `npm run lint` attempt still has the previously documented 656 unrelated/generated findings, including `.runtime/migration-baseline`.
