# Stage 14D validation

**Status:** the TypeScript business backend has been removed from the active
runtime. FastAPI owns domain reads/writes and Alembic owns schema changes;
Next.js retains same-origin route handlers as transport adapters and the
frontend. This is a local/disposable verification record, not a production
deployment or an authorization to switch a production service.

## Runtime and database

- Compose and both CI PostgreSQL services use the pinned `postgres:18.6-alpine`
  image. The Compose PG18 volume is
  `project1_postgres_data_v18:/var/lib/postgresql`, matching PostgreSQL 18's
  parent data volume. The old PG15 `project1_postgres_data` volume is retained;
  the default startup creates a fresh PG18 cluster and does not migrate old
  files. Moving existing PG15 data requires a separately planned, backed-up
  `pg_upgrade` or restore into a fresh PG18 cluster.
- A fresh stack was built and started as Compose project
  `org-erp-stage14d-verify-20261025`, with its own versioned PG18 volume
  `org-erp-stage14d-verify-20261025_project1_postgres_data_v18`. PostgreSQL,
  FastAPI, Next.js and the Python notification worker became healthy. The
  Alembic migrate/schema-verify job exited successfully; both app and backend
  readiness routes returned success.
- PostgreSQL was rechecked during the restart acceptance: container image was
  `postgres:18.6-alpine`, `SHOW server_version` returned `18.6`,
  `SHOW data_directory` returned `/var/lib/postgresql/18/docker`, and the
  mounted volume was `org-erp-stage14d-verify-20261025_project1_postgres_data_v18`
  at `/var/lib/postgresql`.
- Verification databases were on that disposable PG18 cluster only:
  `erp_stage02_test` through `erp_stage13_test`, `erp_stage14b_test`,
  `erp_stage14c_e2e`, plus isolated clones `erp_stage10_e2e` and
  `erp_stage14b_e2e`. The full browser suite used only `erp_stage14c_e2e` and
  `--workers=1`; Stage10 and Stage14B were also verified against their own
  database clones. No PG15 or Stage14C rehearsal project/volume was changed.
- E2E documents were written under the ignored local directory
  `.runtime/stage14c/e2e/stage14d-verify-20261025/documents` (and the separate
  Stage08/10 fixture roots). They contain synthetic test data only.
- The targeted Stage14C restart verifier passed (**1 passed**) against the
  recreated Stage14D Compose app/backend containers, using `STAGE14C_VERIFY_ONLY=1`
  and the existing persisted `flow-state.json`. The only containers recreated
  for the successful check were `org-erp-stage14d-verify-20261025-app-1`
  (`b68625349bda` → `dab2eead1270`) and
  `org-erp-stage14d-verify-20261025-backend-1` (`acd3bf2bb003` →
  `baf9f406159a`). Both were healthy after recreation; PostgreSQL and worker
  containers were left running unchanged. The app/backend were configured only
  for this check to use `erp_stage14c_e2e` and a bind of the synthetic document
  directory.
- Before and after restart, the fixture rows matched: project
  `cmvnplo33g3dhuxmsvii99d9u`, task `cmvnplo5eg3dkuxmsbeuu8ng6`, procurement
  `cmvnploecg3e5uxmsw4upbzc9` (`CAPITALIZED`), asset
  `cmvnplq99g3emuxmsq5fg0fmv`, time entry `cmvnplo6pg3douxms00xg04js`, and
  timesheet `cmvnplo85g3druxmsvkprzvci` (`APPROVED`). Payroll period `2051-9`
  remained `CLOSED`. Both document version rows retained SHA-256
  `d1597d3f6a14f63cddd3afc5f269371ce8477fc07b89f5d22c63660fddee14ec`; each
  corresponding physical object still hashed to the same value. The verifier
  also checked the project/task/timekeeping/procurement/document/payroll APIs
  through the restarted app/backend.
- The first check attempt used a read-only bind and surfaced
  `INVALID_STORAGE_ROOT`: storage initializes its root descriptor with
  `fchmod`, even for a read. The disposable synthetic fixture bind was changed
  to writable and the same GET-only persisted-flow verification then passed;
  no real or Stage14C data was modified.

## Runtime ownership checks

- TypeScript business services, repositories, the TS notification worker,
  Prisma client runtime, NextAuth, the bearer bridge and the now-unused
  internal-auth credentials route/secrets are removed. Python session auth and
  the public CSRF-protected login/logout remain active.
- Frontend enum contracts live under `src/lib/contracts`; production source
  has no `@prisma/client`, NextAuth or Prisma database imports. Prisma schema,
  migration history and E2E fixture utilities remain for historical/test
  compatibility; the client and generator are dev dependencies, and
  `prisma generate` runs only from `test:e2e`.
- No frontend app/build/container runtime receives the domain `DATABASE_URL`.
  The database URL remains available to Python and to the isolated E2E
  fixture process. Active writes and authorization/resource scopes are enforced
  by Python; browser-facing URLs remain same-origin transport adapters.
- Pre-migration route-caller and writer-owner maps are retained under
  `docs/backend-migration/archive/stage00/` as historical evidence.
- A request-flow walkthrough, Alembic/Python CLI instructions, testing
  commands, startup instructions and architecture guardrails are in the root
  README. Stage 09/13 operational gates were not changed or claimed complete.

## Checks

- `npm run check`: lint passed (78 warnings, no errors), typecheck passed,
  backend CLI Node tests passed (4), Vitest passed (82 files, 227 tests).
  The default Next Turbopack build was denied by the local sandbox when it
  attempted to bind a port (`Operation not permitted`); the same production
  build passed with `npm run build -- --webpack`. Docker's production app image
  also built as part of the fresh Compose start.
- `npm run test:e2e -- --workers=1`: **16 passed, 1 skipped**. The skip is the
  Stage 14C restart half, which requires a separate app/backend restart between
  its write and verify phases. The initial parallel run shared a DB while
  Stage 10 and Stage 14C independently selected “unused” payroll periods; its
  409 was reproduced by the shared `SUBMITTED` fixture and eliminated by
  serialized execution. Stage10 and Stage14B targeted runs also passed on
  their isolated databases.
- `uv run pytest -q`: **467 passed**. The SMTP listener test ran after granting
  the local bind permission; no backend tests were skipped. Architecture tests:
  **11 passed**. `uv run mypy app` passed (255 files), and `uv run ruff check .`
  passed.
- `ruff format --check .` still reports 16 repository files that would be
  reformatted, including unrelated pre-existing files. Changed Python files
  were checked/formatted individually; none intersects the Stage14D-changed
  Python files. No unrelated Stage 09/13 code was reformatted.
- `git diff --check` passed. `next-env.d.ts` remains byte-for-byte at the
  supplied SHA-256 `d55d89a99f49bee7df149125eb311367460827b1d986ae98ca312c9e10caa478`.

## Remaining gates

- After the restart verifier passed, only Compose project
  `org-erp-stage14d-verify-20261025` and its two scoped volumes
  (`org-erp-stage14d-verify-20261025_project1_postgres_data_v18` and
  `org-erp-stage14d-verify-20261025_project1_document_data`) were removed. The
  pre-existing PG15 volume and Stage14C rehearsal project/volumes remain
  untouched.
- No production deploy, production data migration, or Stage09/13 operational
  gate was performed. The final educational pause remains: review the request
  flow and independently make a small Python service/domain change and test.
