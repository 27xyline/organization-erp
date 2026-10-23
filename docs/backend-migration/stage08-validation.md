# Stage 08 validation ledger

Whole-change review BASE: `d8fc6c34a039509c1783076be0e71cead6f96000`. BFF task-review BASE: backend commit `332ee335e8b46c339b140527601bbd45b3004a34`. Source schema/database and original user document root remain read-only; all database/runtime tests use isolated Stage 08 copies.

## Completed gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Python full suite after backend fix2 | 279 passed | `.runtime/stage08/backend-final-pytest.log` |
| Frontend focused BFF/stream/read suite | 22 passed / 5 files | Command and output in `task-08-bff-report.md` |
| Full Vitest baseline | 273 passed, 5 skipped / 93 files passed, 2 skipped | Command and output in `task-08-bff-report.md` |
| TypeScript | `tsc --noEmit` passed | Command in `task-08-bff-report.md` |
| Changed-file ESLint | passed with zero warnings | Command in `task-08-bff-report.md` |
| Playwright Stage 08 document workflow | passed | UI upload → version → streamed download bytes/SHA/headers → prior version BFF download → UI archive; viewer create denied |
| Full Playwright baseline | 11 passed in 44.3s | Command in `task-08-bff-report.md` |
| Protected source files | exact hashes retained | `next-env.d.ts` SHA `d55d89a99f49bee7df149125eb311367460827b1d986ae98ca312c9e10caa478`; `tsconfig.json` SHA `3336d447bca5f48a2614cc5b4636c10178f0bfcce92c6fc277fe66f35087f885` |
| Source-preserving storage copy | original versions matched adapter byte SHA/size 66/66; old TS HTTP capture also compared a source version | `.runtime/stage08/legacy-preserved-reference-check.json`, `.runtime/stage08/legacy-documents-capture.json`; the Python HTTP result is listed separately |
| Python HTTP read of old version | one source-preserved original version returned 200 and matched copied metadata size/SHA plus download integrity/privacy headers | Sanitized private result `.runtime/stage08/python-legacy-http.json`; actual file hash is not repeated in this ledger |

## Docker integration gates — passed 2026-10-23

- Standard Compose `app` runner image built successfully from `Dockerfile`: `npm ci`, Prisma Client generation, Next 16.3.4 production build (48/48 static pages), and worker bundle all completed. BuildKit emitted two existing dynamic-filesystem tracing warnings from `read-only-document-storage.ts`; the image build succeeded.
- Standard Compose backend image built successfully from `backend/Dockerfile`; locked `uv sync` installed all 53 packages without the temporary timeout overrides used in the earlier diagnostic build.
- Only the two Stage 08 app/backend containers were started. App readiness and backend live/ready returned HTTP 200; backend readiness executed `SELECT 1`. The app's Credentials callback returned 200, created an authenticated session, and the authenticated `/api/documents` BFF request returned 200 through the backend bridge.
- Both processes ran as UID/GID 1001. DejaVuSans was present in the backend image. App wrote a mode-0600 probe to the new `erp-stage08-final_project1_document_data` volume; backend read it and wrote a reply; app read the reply. Both synthetic files were removed. This verifies the cross-image shared-volume permissions using each runtime UID.
- Runtime configuration pointed app and backend to the same isolated `erp_stage08_e2e` database, the same `/var/lib/project1/documents` mount, and the same storage size limit. Because the Compose file's default database hostname is intended for its own Postgres service, the smoke used an ignored temporary Compose override with `host.docker.internal:5434` for the already-running isolated test database. No migration, worker, observability service, source database, or real documents volume was used.
- The first retry attempt was blocked by sandbox access to the Docker socket; the authorized Docker run then succeeded. The temporary app/backend containers, networks, and named volumes were removed after the smoke. Stage 08 Docker integration gates are closed.

The documented backend recovery/persistence evidence, BFF ownership boundaries, remaining TypeScript exceptions, exact commands and test counts are in `task-08-backend-report.md` and `task-08-bff-report.md`. Operations paths and source-copy details are in `task-08-ops-report.md`. No Stage 09 changes or exercise substitution were made; file-size limits remain required tests.
