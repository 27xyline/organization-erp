# Stage 14B — Python sessions and browser auth

Date: 2026-10-24
Status: implementation and focused checks complete; paused for user review before Stage 14C.

## Implementation

- Added Python-owned opaque browser sessions with 256-bit token entropy. Only a
  SHA-256 token hash is stored. Resolution checks expiry, revocation, active
  user state, and `sessionVersion`; sessions expire after eight hours.
- Added `/api/auth/login`, `/api/auth/logout`, `/api/auth/csrf`, and
  `/api/account/me`. Login reuses the existing `CredentialsInput` contract and
  preserves the credential-attempt counters from Stage 03.
- Login/logout and unsafe requests carrying the session cookie require a valid
  signed double-submit CSRF cookie/header pair. Configured `Origin` must match
  `BACKEND_PUBLIC_ORIGIN`; a missing Origin does not bypass token validation.
  Missing, short, or reused internal CSRF secrets fail closed.
- Session cookies are `HttpOnly`, `Path=/`, `SameSite=Lax`, `Secure` in
  production, and have no broad `Domain`. Logout revokes the DB row and clears
  the cookie. Password, role/scope, and active-state changes continue to revoke
  sessions through `sessionVersion`.
- Next BFF forwards the browser cookie, Origin, CSRF header, and backend
  `Set-Cookie`; SSR resolves the actor through Python `/api/account/me` with
  `no-store`. The proxy validates the Python actor and does not trust cookie
  presence. Login/session UI now uses the Python adapter.
- Added Alembic revision `20261024_user_sessions` and
  `catalog_stage14b.json`. Stage 14A's frozen baseline/final catalogs and
  migration inputs were not changed.
- Added `backend/tests/audit_cleanup.py`: test fixture cleanup may truncate
  audit rows only when `current_database()` is in the explicit disposable test
  database allowlist. The production append-only trigger is never disabled.

## Verification

Backend commands below run from `backend/` unless noted.

```sh
uv run pytest tests/unit/sessions tests/integration/sessions tests/contracts/sessions -q
```

Result: **15 passed**. Coverage includes token entropy/hash-only persistence,
eight-hour expiry, expired/revoked sessions, login token rotation, logout,
password and role changes, inactive/forced-password users, CSRF/origin failures,
and the minimal actor contract.

The append-only audit trigger initially exposed test fixtures that tried to
delete audit rows directly. The following focused cleanup and affected-finance
regressions passed after adding the disposable-database-only helper:

```sh
uv run pytest tests/integration/test_audit_cleanup.py tests/integration/auth/test_users.py tests/integration/departments/test_department_service.py tests/integration/employees/test_workflows.py tests/integration/notifications/test_notifications.py tests/integration/projects/test_workflows.py tests/integration/assets/test_workflows.py tests/integration/approvals/test_workflows.py tests/integration/outbox/test_outbox_delivery.py tests/integration/finance/test_period_lock.py -q
# 73 passed

uv run pytest tests/integration/finance/test_payroll_service.py::test_adjustment_create_and_delete_use_open_period_and_write_audit tests/integration/finance/test_payroll_locks.py tests/integration/outbox/test_outbox_worker_processes.py -q
# 5 passed

uv run pytest tests/integration/finance/test_payroll_service.py::test_payroll_month_matches_legacy_golden_fields_and_numbers -q
# 1 passed
```

From the repository root:

```sh
backend/.venv/bin/pytest backend/tests/unit/test_audit_cleanup.py -q
# 1 passed

npm test -- src/lib/auth/__tests__/authorization.test.ts src/lib/auth/csrf-fetch.test.ts src/lib/backend/session.test.ts src/proxy.test.ts
# 17 passed

npm run typecheck
npx playwright test --config=playwright.stage14b.config.ts
# 1 passed
```

Changed-file Ruff check/format, targeted mypy, changed-file ESLint, and
`git diff --check` passed. Playwright used a temporary source mirror because
Next's dev server rejected the workspace `node_modules` symlink; the Webpack
retry passed. No full backend/frontend suite, production build, or remote CI
run was performed for this stage.

## Isolation and cleanup

- The disposable Compose project was `org-erp-stage14b-review`, with the
  session target database `erp_stage14b_test` published only on
  `127.0.0.1:55442`. Regression fixtures were constrained to the explicit
  `erp_stage02_test`–`erp_stage14_test` and `erp_stage14b_test` allowlist.
- The temporary project containers, volume, and network were removed. No
  production database was connected to or migrated.
- User-owned `next-env.d.ts` remains outside the Stage 14B commit; its SHA-256
  is `d55d89a99f49bee7df149125eb311367460827b1d986ae98ca312c9e10caa478`.

## Review boundary and known limitation

Stage 14B is complete and paused here for review of browser cookies, server
sessions, CSRF, and `sessionVersion`. Stage 14C rehearsal/cutover, Stage 14D
legacy removal, and the previously requested return to Stage 13 have not
started.

The unused `useSession()` adapter currently synthesizes `expires` as the
current time plus eight hours instead of returning the server's exact expiry.
There are no application consumers of this adapter today; if it becomes used,
the API contract should expose the actual expiry before relying on that field.
