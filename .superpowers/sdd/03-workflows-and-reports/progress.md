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
