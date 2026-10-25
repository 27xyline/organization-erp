# Backend migration records

The active architecture is FastAPI + PostgreSQL + Alembic. Next.js contains
the frontend and same-origin transport adapters. Stage 14C acceptance passed
in a disposable environment; this is not production cutover authorization.
See the root [README](../../README.md) for the current request flow and start
path.

## Repository layout after cleanup

Python remains in `backend/`; Next.js and browser tests are in `frontend/`.
Run npm/Playwright commands from `frontend/`. Earlier stage reports below are
historical: their old root-relative Next/Prisma paths and npm CLI wrappers
describe the checkout at the time of that stage. Duplicate Prisma SQL files
were removed only after all 41 were compared byte-for-byte with the frozen
Alembic baseline. The remaining Prisma schema is test-only, at
`frontend/e2e/prisma/schema.prisma`. The original files remain in Git history.

## Current stages

| Document | Scope |
| --- | --- |
| [Stage 14A handoff](migration-handoff.md) | Verify-and-stamp rules and Alembic schema ownership |
| [Stage 14B validation](stage14b-validation.md) | Python sessions, CSRF and browser auth |
| [Stage 14C acceptance](acceptance-report.md) | Disposable database/document rehearsal and measured checks |
| [Stage 14D validation](stage14d-validation.md) | Python-only runtime, PostgreSQL 18, final checks and remaining operational gates |
| [Cutover runbook](cutover-runbook.md) | Rehearsal-backed cutover sequence; production still requires separate authorization |
| [Rollback runbook](rollback-runbook.md) | Restore and isolated legacy compatibility rehearsal |

The API contract and schema inventory are baseline snapshots. Their TypeScript
caller and write-owner maps are archived in
[`archive/stage00/`](archive/stage00/) because they describe the pre-migration
runtime from 7 October 2026, not the current owner of routes or database writes.

Historical stage ownership and validation reports remain available alongside
their original stage files. Do not use an older report as a substitute for
current source or Stage 14C acceptance evidence.
