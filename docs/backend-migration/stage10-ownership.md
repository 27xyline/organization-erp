# Stage 10 ownership — timekeeping and finance slices

The first Stage 10 ownership switch covers the time-entry and timesheet workflow cluster. Python owns the timekeeping read model, entry create/update/delete, timesheet submit/decision, payroll-period lock checks, approval state transition and associated audit/notification intents. The browser keeps the same `/api/time-entries` and `/api/timekeeping/timesheets` URLs. Next handlers preserve their current permission checks and Zod request validation, then proxy the original request to FastAPI with the authenticated backend bridge.

The finance slice moves `/api/finance/plans` (GET/POST/DELETE), `/api/finance/salary` (GET), and `/api/projects/{id}/payroll` (GET/PUT/DELETE) to Python ownership. SQLAlchemy repositories and one caller-owned UoW replace the former TypeScript services. Finance plan/project payroll writes share the payroll-period lock check; plan replace/clear and project `actualBudget` adjustments commit atomically. Next handlers retain the legacy authorization scopes, request validation, paths, and public JSON response envelopes. The salary route keeps its legacy `{data: ...}` envelope; plan and project payroll routes keep their raw result/success envelopes.

The payroll month and period slice moves `/api/payroll` (GET/POST), `/api/payroll/adjustments/{id}` (DELETE), and `/api/payroll/period` (PUT) to Python ownership. Payroll month GET preserves the legacy numeric totals, employee/project options, department totals and project forecasts. Adjustment create/delete use the same `(year, month)` lock protocol and write audit records in the caller-owned UoW. Period close/reopen uses `PayrollPeriodService`; Next keeps the current URLs, permission gates, and schema prechecks. These handlers return the legacy `{data: ...}` shape. Export and payslip routes remain TypeScript-owned until their renderer slice.

The finance and project payroll pages render under their existing SSR permission gates and load tables through the stable client BFF URLs. Payroll month client reads and period/adjustment mutations now use the Python BFF. Export and payslip routes still call the TypeScript renderer.

The API routes are:

- `GET` and `POST /api/time-entries`
- `PUT` and `DELETE /api/time-entries/{entry_id}`
- `POST /api/timekeeping/timesheets`
- `POST /api/timekeeping/timesheets/{timesheet_id}/decision`

Entry writes, timesheet state, audit, Stage 09 approval state and notification intents share the caller-owned UoW. The common payroll-period repository locks every affected `(year, month)` in sorted order. A correction to an approved timesheet returns it to `DRAFT` in the same transaction. PostgreSQL 18 integration tests cover the approval rollback and period close-vs-writer behavior.

The `/timekeeping` server page currently performs only its permission check and renders the client component. That component loads data through `GET /api/time-entries`; there was no separate SSR data loader to switch. The page permission check and URL remain in Next.js.

Payroll period, month and adjustment routes are Python-owned. Export and payslip remain TypeScript-owned pending their separate Stage 10 slice. Stage 05 employee/workforce mutations remain unchanged: source inventory found no payroll-period row writer there.

Validation commands and the current list of remaining Stage 10 scope are recorded in [stage10-report.md](../../.superpowers/sdd/03-workflows-and-reports/stage10-report.md).
