# Stage 12 ownership — reporting, dashboard, search, and exports

FastAPI is the runtime owner for Stage 12 user-facing read APIs. The Next route handlers retain browser URLs, authenticate and preserve Zod validation, then forward through the Stage 12 bridge. Backend services/repositories enforce the scopes at SQL selection time and return materialized DTOs.

| Public API / caller | Owner | Python implementation |
|---|---|---|
| `GET /api/search` | FastAPI | `SearchService`, scoped SQL repository for employees/assets/projects/tasks/documents |
| `GET /api/dashboard` | FastAPI | `DashboardService` and SQL reporting repository |
| `GET /api/my-actions` | FastAPI | `MyActionsService` and SQL reporting repository |
| `GET /api/reports/turnover` | FastAPI | `ReportingService.turnover` |
| `GET /api/reports/profitability` | FastAPI | `ReportingService.profitability` |
| `GET /api/reports/depreciation` | FastAPI | `ReportingService.depreciation` |
| `GET /api/reports/vacations` | FastAPI | `ReportingService.vacation_calendar` |
| `GET/POST/DELETE /api/reports/presets` | FastAPI | Presets are user-owned; list/delete are constrained by `createdById` |
| `POST /api/reports/custom` | FastAPI | Metrics and grouping checked against permissions before scoped SQL aggregation |
| `GET /api/reports/export` | FastAPI | Dashboard projection shared with dashboard endpoint, then XLSX/DOCX/PDF rendering |
| Root dashboard and reports SSR | FastAPI | Server components call authenticated `/api/dashboard` and `/api/my-actions` endpoints; no Prisma reporting service import remains |
| `seed`, `verify-data`, `create-admin` | Python CLI | Explicit commands compose `DemoSeedService`/`VerifyDataService` with SQLAlchemy CLI repository adapters; `create-admin` uses `UserService.create_initial_admin` |

The `/api/reports/export` response is binary, status 200, attachment filename, `Cache-Control: no-store`, and `X-Content-Type-Options: nosniff`. `api/dependencies.py` wires SQL, audit, and rendering adapters to service ports. The dashboard projection is materialized and its SQL session closed before rendering starts in a worker thread. XLSX, DOCX, and PDF include the same scoped workforce, project, asset, vacation, and deadline detail sections. UI URLs remain stable through the BFF. Existing `/api/export` asset export remains Python-owned by Stage 07.

The Stage 12 Python seed creates a small connected learning graph: department → staff schedule → employee → project membership → task assignment. It is idempotent and deliberately does not reproduce the full TypeScript demo dataset. `prisma/demo-seed.ts` remains the broader fixture for 10 departments, 40 employees, 24 projects, 20 assets, demo role users and related procurement/document scenarios.

The Stage 12 owner list does not move DDL ownership, workflow processors, workers, or background delivery. Production application startup does not run any seed command. The demo seed refuses production and known working database names; it is a local explicit CLI only. See [stage12-validation.md](stage12-validation.md) for verification status and known gates.
