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

## Pending integration gates

- App runner image remains unbuilt because `npm ci` aborted on network access after 116.4s. Backend normal build twice timed out on a locked PyPI wheel; one diagnostic build with only build-time uv timeout/concurrency environment overrides succeeded. Backend UID/GID/font/health/single-image cross-container owned-volume checks passed; app↔backend shared-volume integration and app-container checks remain unverified. Full commands and logs are in `task-08-bff-report.md` and `task-08-ops-report.md`. No Stage08 app/migration/worker services or real documents volume were used.

The documented backend recovery/persistence evidence, BFF ownership boundaries, remaining TypeScript exceptions, exact commands and test counts are in `task-08-backend-report.md` and `task-08-bff-report.md`. Operations paths and source-copy details are in `task-08-ops-report.md`. No Stage 09 changes or exercise substitution were made; file-size limits remain required tests.
