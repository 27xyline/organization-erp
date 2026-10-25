# Backend migration records

The active architecture is FastAPI + PostgreSQL + Alembic. Next.js contains
the frontend and same-origin transport adapters. Stage 14C acceptance passed
in a disposable environment; this is not production cutover authorization.
See the root [README](../../README.md) for the current request flow and start
path.

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
