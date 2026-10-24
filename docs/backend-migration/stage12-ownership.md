# Stage 12 ownership — reporting, dashboard, search, and exports

This file records the implemented ownership boundary at the current Stage 12 checkpoint. The whole stage is **not complete**.

| API or caller | Current owner | Notes |
|---|---|---|
| `GET /api/search` | Python (FastAPI + SQLAlchemy) | Next route retains the public URL, authorization check, and bridge proxy. Backend applies each entity's scope in its SQL query and returns only explicitly selected fields. |
| `/api/reports/*`, report presets, `/api/export`, `/api/reports/export` | TypeScript / Prisma | Not migrated in this checkpoint. Existing permission checks and response contracts remain active. |
| Root dashboard, my-actions, reports SSR | TypeScript / Prisma | Existing server component imports remain. |
| Reporting XLSX/DOCX/PDF/QR rendering helpers | Python integration module | Generic renderers are present, but report/export API integration is pending. They must be called after the DB unit of work via `asyncio.to_thread`. |
| `seed`, `verify-data`, `create-admin` CLI | TypeScript / Prisma | Python CLI migration is pending. |

Python remains the owner for previously migrated groups. This checkpoint changes no DDL ownership, workers, or Stage 13 processors. The user-owned `next-env.d.ts` is excluded from this work.
