# Stage 12 validation — checkpoint

Stage 12 is incomplete. Do not treat this document as stage acceptance.

## Evidence collected

- Pure reporting aggregation uses `Decimal` for payroll totals; its fixture contains 137 employees and checks full-scope totals plus page count.
- `GET /api/search` is Python-owned. The SQL repository puts visibility predicates in the employee, asset, project, task, and document queries; result shaping contains only authorized projections.
- XLSX, DOCX, PDF, and QR renderer unit tests check generated formats, Russian labels, embedded TrueType font, safe filename, and numeric cells.
- The search scope integration test is implemented but did not reach SQL execution.
- Focused Ruff formatting/check passed for the changed Python code.
- Focused mypy passed for the changed Python modules (6 files); `tests/unit/reporting` passed (4 tests).
- The search BFF Vitest suite passed (2 tests); focused ESLint for the changed Next.js files passed, and `npm run typecheck` passed.
- Full `npm run lint` was attempted but failed on 656 errors in generated and existing repository files under `.runtime/migration-baseline/...` and other existing sources; the focused changed-file lint remained clean.
- The Stage 12 unit, reporting integration, reporting contract, and export integration suites pass (`9 passed`). The full requested command still includes the PostgreSQL-backed search integration test; that test remains blocked at connection setup as described below.

## Database blocker

The test URL is configured in `.runtime/stage11/test.env` and names the isolated database `erp_stage11_test`. No Docker or container lifecycle commands were run. The focused command was:

```sh
set -a; source ../.runtime/stage11/test.env; set +a
UV_CACHE_DIR=/private/tmp/uv-stage12 uv run pytest tests/unit/reporting tests/integration/search -q
```

The first combined invocation collected 4 non-database tests but the database fixture failed before schema or row changes with `PermissionError: [Errno 1] Operation not permitted` while connecting to `127.0.0.1:55432`. After that, the reporting contract and in-memory integration suites were added and independently passed. The complete command, including search integration, remains unverified pending the permitted connection. Python verify-data and the dashboard/report/search/export Playwright flow also remain unverified.

## Outstanding acceptance

- Migrate report kinds, presets, SQL dashboard aggregates, and my-actions; verify full-scope totals and pagination on >100 database rows.
- Complete per-entity search integration coverage and run it against the isolated test database.
- Wire export renderers to scoped report/export endpoints and verify binary status/headers and forbidden fields across formats.
- Move seed/verify/create-admin CLIs and callers through Python services, with a production seed guard and idempotence.
- Cut over dashboard/reports SSR and remove the remaining reporting/search TypeScript service and Prisma imports.
- Measure and record dashboard/report latency and SQL counts over a fixed dataset, filters, and iterations.
