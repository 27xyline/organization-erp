# Backend/frontend layout and cleanup

**Goal:** separate the Python backend and Next.js frontend within the existing repository.
**Architecture:** `backend/` owns Python and Alembic; `frontend/` owns Next.js, dependencies and browser tests. Compose, ops and migration evidence stay shared at the root.
**Constraints:** preserve local configuration, data, backups, Alembic history and the supplied next-env.d.ts contents. No branches or commits.

## Tasks
- [x] Move the Next app and tooling into frontend; fix Compose, CI and Playwright paths.
- [x] Remove unused TS business calculators, obsolete Node CLI wrappers, duplicate Prisma SQL and stale build output. Keep the Prisma schema only for E2E fixture generation.
- [x] Update startup/docs; run frontend lint, typecheck, tests and production build, backend unit/architecture tests, Compose validation and browser discovery.

## Review focus
- Frontend builds from its own directory without Python source or database credentials.
- Playwright starts the sibling backend and retains isolated database/storage guards.
- Alembic contains all legacy SQL before duplicate Prisma migrations are removed.
- Python admin/seed/verify commands remain documented and usable.
- Existing data and local edits remain intact.

## Verification
- Frontend: 77 test files / 214 tests passed after dependency pruning; typecheck passed; ESLint 0 errors / 78 existing warnings; Next production Webpack build passed.
- Backend: 176 unit and architecture tests passed. Python business source and Alembic revisions unchanged.
- Compose: both configurations and observability profile validate; frontend build context is frontend/, Python services use backend/, frontend gets no domain DB URL.
- E2E: Prisma client generation and discovery of all 17 browser scenarios passed; full database-backed browser execution was not rerun.
- Runtime smoke: temporary FastAPI live and Next login endpoints returned 200; Next -> Python CSRF returned 200 and forwarded JSON and Set-Cookie. Both temporary servers stopped. No database connection used.
- next-env.d.ts preserved at SHA-256 d55d89a99f49bee7df149125eb311367460827b1d986ae98ca312c9e10caa478.
- Existing .env, runtime data and backups preserved; no branches or commits created.
