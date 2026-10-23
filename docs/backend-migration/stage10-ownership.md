# Stage 10 ownership — timekeeping and finance slices

The first Stage 10 ownership switch covers the time-entry and timesheet workflow cluster. Python owns the timekeeping read model, entry create/update/delete, timesheet submit/decision, payroll-period lock checks, approval state transition and associated audit/notification intents. The browser keeps the same `/api/time-entries` and `/api/timekeeping/timesheets` URLs. Next handlers preserve their current permission checks and Zod request validation, then proxy the original request to FastAPI with the authenticated backend bridge.

The finance slice moves `/api/finance/plans` (GET/POST/DELETE), `/api/finance/salary` (GET), and `/api/projects/{id}/payroll` (GET/PUT/DELETE) to Python ownership. SQLAlchemy repositories and one caller-owned UoW replace the former TypeScript services. Finance plan/project payroll writes share the payroll-period lock check; plan replace/clear and project `actualBudget` adjustments commit atomically. Next handlers retain the legacy authorization scopes, request validation, paths, and public JSON response envelopes. The salary route keeps its legacy `{data: ...}` envelope; plan and project payroll routes keep their raw result/success envelopes.

The payroll month and period slice moves `/api/payroll` (GET/POST), `/api/payroll/adjustments/{id}` (DELETE), and `/api/payroll/period` (PUT) to Python ownership. Payroll month GET preserves the legacy numeric totals, employee/project options, department totals and project forecasts. Adjustment create/delete use the same `(year, month)` lock protocol and write audit records in the caller-owned UoW. Period close/reopen uses `PayrollPeriodService`; Next keeps the current URLs, permission gates, and schema prechecks. These handlers return the legacy `{data: ...}` shape.

The export slice also moves `/api/payroll/export` and `/api/payroll/export-payslip` to Python. FastAPI obtains the payroll month payload and exits its UoW before rendering the legacy XLSX with `openpyxl` in a worker thread. Both routes require `payroll.export`; payslip lookup uses only rows visible in the caller's payroll month response. Next forwards the original query and preserves binary response headers/body without a TypeScript renderer fallback.

The finance and project payroll pages render under their existing SSR permission gates and load tables through the stable client BFF URLs. Payroll month, period/adjustment, export, and payslip calls use the Python BFF. The `/timekeeping` server page retains its permission gate and the client loads its month through the Python-owned BFF.

The API routes are:

- `GET` and `POST /api/time-entries`
- `PUT` and `DELETE /api/time-entries/{entry_id}`
- `POST /api/timekeeping/timesheets`
- `POST /api/timekeeping/timesheets/{timesheet_id}/decision`

Entry writes, timesheet state, audit, Stage 09 approval state and notification intents share the caller-owned UoW. The common payroll-period repository locks every affected `(year, month)` in sorted order. A correction to an approved timesheet returns it to `DRAFT` in the same transaction. PostgreSQL 18 integration tests cover the approval rollback and period close-vs-writer behavior.

The `/timekeeping` server page currently performs only its permission check and renders the client component. That component loads data through `GET /api/time-entries`; there was no separate SSR data loader to switch. The page permission check and URL remain in Next.js.

All Stage 10 timekeeping, finance, project payroll, payroll month/adjustment/period, export, and payslip API owners are Python behind the Next BFF. Stage 05 employee/workforce mutations remain unchanged: source inventory found no payroll-period row writer there. HR salary/rate changes have no effective date and both legacy TS and Python calculations read the current master values for historical periods; they therefore retroactively affect previously closed payroll, matching existing behavior. Period locks apply to period-indexed writers and do not claim historical snapshot immutability.

Validation commands and the current list of remaining Stage 10 scope are recorded in [stage10-report.md](../../.superpowers/sdd/03-workflows-and-reports/stage10-report.md).
