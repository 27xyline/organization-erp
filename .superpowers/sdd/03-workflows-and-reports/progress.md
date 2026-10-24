# SDD ledger — plan: docs/superpowers/plans/2026-09-28-fastapi/03-workflows-and-reports.md

BASE: `6e0f8d25c4c961c265e07978140de1424cf602e1` (Stage 08 Docker-gate docs commit).

Pre-flight scan for the single selected Stage 09: `create_approval_in_uow(command, context, uow)` consumes the existing shared UoW and NotificationIntentPort from Stage 03; the mapped Approval/Notification/SmtpSettings models already exist from Stage 02; the Document repository port is available from Stage 08. Stage 10 consumes the approval port but is outside this task. No contradictory file/interface contract found.

Scope: only Stage 09 from the brief. Preserve TS manual `/smtp/process` and `/generate-alerts`; delivery processor stays TS until 13.

## Selected Stage 10 — 23 октября 2026

BASE: `49402be73aa612bb1b3f76bdfb1a87d40ba56a6c` (Stage09 architecture/docs follow-up commits).

Brief: `stage10-brief.md`. Status: in progress. Scope is Stage 10 only; preserve the user-owned `next-env.d.ts` change and leave Docker containers running.

Pre-flight scan (Stage 10 interfaces):

| Consumer / producer | Shared interface | Finding | Ruling |
|---|---|---|---|
| Stage 10 time-entry/timesheet writes ↔ finance-period close | `(year, month)` row-lock protocol | Same period lock must serialize both paths; no split TypeScript/Python owner during Stage 10. | Use one Python period-lock port/repository flow for all switched writers; only actual Stage05 writes are added after source inventory confirms them. |
| Stage 10 timesheet workflow ↔ Stage 09 approvals | `create_approval_in_uow(command, context, uow)` | Approval creation and timesheet mutation must share caller-owned UoW. | Reuse the Stage09 approval port and the same UoW; do not call another HTTP endpoint. |
| Stage 10 services ↔ existing models/UoW/references | SQLAlchemy mappings, Employee/Project/Approval/Workforce references | Models and base repositories already exist; mapping presence is not proof that Stage10 scenarios are implemented. | Add only focused ports/repositories and verify relation loading and permissions at the service boundary. |
| Stage 10 legacy source ↔ browser BFF/SSR | Existing TS routes, contracts, payroll-period helper | Stage10 owner remains TypeScript until the whole cluster switches. | Preserve public request/response/error contracts; remove TS fallback only after backend route coverage is complete. |

Self-consistency: all eight Stage10 acceptance bullets fit the architecture spec. Concurrency, approval, and all financial writes converge on the period lock and caller-owned UoW. No Stage11+ work is included.

Task 1 (foundation + timekeeping slice) and finance/payroll/export ownership slices are implemented behind the authenticated Stage10 BFF. PostgreSQL 18 backend brief passed (**52 tests**), Stage10 owner route tests passed (**13 files, 22 tests**), and the stage-wide close/edit/approve Playwright smoke passed on isolated `erp_stage10_e2e` (**1 test**). Payroll XLSX exports use Python/openpyxl after UoW exit; Next routes preserve binary response details without a TypeScript fallback. Stage10 plan checks now reflect verified acceptance; the HR-writer row-lock item stays unchecked because HR schedule/rate/status have no effective date and legacy calculations use current employee data for historical periods. Details and exact commands are in `stage10-report.md`.

Review follow-up for the timekeeping slice: fixed stale rejected-approval selection after RETURN/edit/resubmit and added correctionReason to update/delete audit details. Both regressions were reproduced RED and verified GREEN with focused PostgreSQL 18 tests; evidence is appended to `stage10-report.md`.

## Selected Stage 12 — 24 октября 2026

BASE: `61deacd00807ad07769e8bc850a941c25631c2d2` (Stage 11 committed; the only existing worktree edit is the user-owned `next-env.d.ts`).

Brief: `stage12-brief.md`; implementation report: `stage12-report.md`. Scope is Stage 12 only; Stage 13 is not started. The plan task-brief helper did not recognize its `Этап 12` heading, so the brief was transcribed from that exact section at `03-workflows-and-reports.md:78-96`.

Pre-flight scan:

| Producer / consumer | Shared interface | Finding | Ruling |
|---|---|---|---|
| Reporting/search repositories ↔ services | scoped SQL results and DTOs | Full scope must be applied before page slicing; DTOs must be materialized before session close. | Keep scope predicates in repository queries, aggregates at SQL/domain boundary, and return fully materialized DTOs. |
| Report list ↔ report exports | filters, permissions, fields | A separate renderer path can otherwise reveal fields excluded from the list. | Share the filtered/scoped data query and validate every export format against the same allowed field set. |
| Search per-entity query ↔ result shaping | authorization and snippets | A hidden UI result is insufficient if title/snippet/id are already selected from unauthorized rows. | Apply access scope in each entity query and shape only authorized projections. |
| Export rendering ↔ DB/event loop | synchronous renderer and UoW | Long rendering inside a session/transaction or on the event loop would violate architecture constraints. | Finish data loading/UoW first; run heavy renderers in a worker thread. |
| Next SSR/BFF ↔ Python APIs | public method/status/headers | Binary response proxying and existing SSR contracts must remain compatible. | Cut over all Stage12 callers together; preserve status and response headers, with no Prisma fallback. |
| Python CLI ↔ database configuration | seed/write safety | A mistaken environment can write bootstrap data into the working database. | Keep explicit production guard, idempotence, and no automatic production seed. |

Self-consistency: Stage 12's required files and checks align with the architecture spec. No DDL, migration ownership, worker, or Stage13 processor changes are in scope. The only pre-existing user edit is `next-env.d.ts`; preserve it and exclude it from commits. Existing DB availability should be checked without changing Docker lifecycle; never point tests or scripts at `project1`.

| Follow-up interface | Finding | Ruling |
|---|---|---|
| Python seed CLI ↔ legacy demo dataset and SQLAlchemy boundary | `DemoSeedService` currently creates only empty departments and directly owns ORM/SQL operations; `VerifyDataService` also embeds queries. That does not provide the planned training copy or keep application services behind ports. | Provide a connected, rerunnable training dataset through repository/port adapters; move verification queries behind a read port. Keep the explicit local/non-production guard, no startup seed, and no writes to working databases. |

Implementation follow-up: dashboard, report kinds/presets, my-actions and scoped report export now have Python routes/services; reports and root dashboard SSR/BFF call FastAPI; Python seed/verify/create-admin CLI paths and the ownership/validation registry are added. The 137-row reporting fixture and five-entity search fixture refuse any database except `erp_stage11_test`. The authorized full pytest run returned 10 passed/1 failed; fixing the employee/document FK ordering made the focused integration rerun pass (1 passed). The no-DB `verify_data` mapper regression also passed (1 passed); the CLI now imports the complete ORM registry before creating its engine. Its subsequent DB-backed run is still pending, with the explicit `BACKEND_DATABASE_URL="$STAGE11_TEST_DATABASE_URL"` mapping documented. The measured baseline is dashboard 13 SQL/query, median 9.44 ms, and turnover 2 SQL/query, median 2.01 ms; the baseline script now emits relevant table row counts, pending the parent's final read-only run. The Stage12 Playwright spec targets `erp_stage09_e2e`; FastAPI now starts after a response-model fix, but global setup cannot connect to `127.0.0.1:5434`, so browser assertions remain unrun. No Docker lifecycle action occurred. See `stage12-report.md` and `docs/backend-migration/stage12-validation.md`; `next-env.d.ts` remains excluded.

Review follow-up — 24 October 2026: `DemoSeedService` now delegates to a repository port that idempotently creates a connected department → schedule → employee → project membership → task assignment graph; `VerifyDataService` delegates read-only consistency queries through its own port/repository adapter. Explicit seed-target guards remain in the CLI and startup has no seed invocation. Focused no-DB CLI tests passed (9), Ruff and mypy passed. The Stage 12 CLI plan checkbox remains unchecked pending isolated DB execution of seed twice and verify-data; the broader demo dataset in `prisma/demo-seed.ts` is explicitly documented as not yet reproduced by Python. No Stage13 work or Docker/database actions occurred.

Task 12: fix round 1/5 (1 addressed, 1 open — DOCX/PDF salary scope; commits 62492a3..041eeed)
Task 12: fix round 2/5 (1 addressed, 0 open — finance scope/PDF assertions; commits 041eeed..60d99d6)
Task 12: fix round 3/5 (1 addressed, 0 open — CLI services behind ports and connected demo seed; commits 60d99d6..9bb3862)
