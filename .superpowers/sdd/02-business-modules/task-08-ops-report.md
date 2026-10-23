# Stage 08 operations report

## Completed

- Created ignored private runtime directory `.runtime/stage08/` with mode `0700` and private `test.env`, `e2e.env`, and `legacy.env` files with mode `0600`. Each environment has its own random auth/bridge/internal secrets. E2E Node and Python settings point to the same `erp_stage08_e2e` database; test and legacy settings use their own Stage 08 database names. No environment values or DSNs are recorded here.
- Copied the existing configured `.runtime/documents` tree into `.runtime/stage08/documents-snapshot/`, then copied that snapshot into each environment's `documents/` root. All four copies contain 66 regular files totaling 15,980 bytes, and every relative path, size, and SHA-256 matches. The copy procedure rejected symlinks and did not follow any; the source tree had zero symlinks. The source tree was only read.
- After Docker became ready, a read-only check of `erp_migration_20261007` found 60 `Document` rows and 66 `DocumentVersion` rows. All 66 version storage keys exist in the source-byte manifest, and all 66 sizes and SHA-256 values match. Private aggregate/reference evidence is in `.runtime/stage08/source-document-reference-check.json` and `.runtime/stage08/legacy-preserved-reference-check.json`; neither file stores raw keys or source record IDs. This confirms the copied bytes correspond to existing version metadata.
- Wrote the private SHA-256 manifest to `.runtime/stage08/documents-sha256-manifest.json`; it contains storage keys and hashes, not file contents. Storage copies and env files are ignored by Git.
- Archived the pre-Stage 08 tracked source baseline outside the repository at `/private/tmp/organization-erp-stage08-legacy-baseline.tar` and extracted it to `/private/tmp/organization-erp-stage08-legacy` for future legacy runtime capture. The extraction uses a symlink to the existing `node_modules`; it does not duplicate the checkout inside Vitest's discovery tree.
- Verified the protected user-owned file hashes: `next-env.d.ts` remains `d55d89a99f49bee7df149125eb311367460827b1d986ae98ca312c9e10caa478`; `tsconfig.json` remains `3336d447bca5f48a2614cc5b4636c10178f0bfcce92c6fc277fe66f35087f885`.

## Blocked / pending

- The previous Compose-mount observation and Python HTTP pending status below are historical and superseded by the BFF follow-up below. Backend route/runtime ownership now receives the shared configured volume; a source-preserving version has been verified through Python HTTP. The dedicated container build and permissions smoke remain pending.

## Database and legacy capture

- Docker daemon info returned server `29.6.1`; only Compose `postgres` was started, healthy on its existing host port 5434. No app, migration, worker, or observability service was started.
- Fresh template copies were created from `erp_migration_20261007`. `erp_stage08_test` and `erp_stage08_e2e` each have 52 public tables and zero rows. Backend coordination confirmed no tests were running before its request to reset only `erp_stage08_test`; active sessions were checked as zero, then that copy alone was truncated and reverified. The source and E2E copy were untouched by that reset.
- `erp_stage08_legacy` is the source-preserving copy: it retains the original 60 documents and 66 versions. After the initial clean-copy preparation, the legacy copy was replaced with a fresh template copy before any legacy runtime capture, following clarification that old version metadata must remain available. It now also contains synthetic Stage 08 capture users/documents; no original metadata or files were removed.
- The private live capture is `.runtime/stage08/legacy-documents-capture.json` (mode 0600). It includes exact request/response DTOs and IDs only for S08-prefixed synthetic records, route statuses and header/hash checks, synthetic audit details, and outbox delta. `/api/documents/options` is shape-only because it can contain real linked-entity names. The original old-version download is recorded as status/size/SHA/header assertions only. Synthetic scenarios covered upload v1/v2, list, detail, current and versioned download, status change, archive, generated DOCX, denied create (403), and corrupted synthetic download (503); outbox delta was zero. Successful downloads matched stored size/SHA, and the corrupted synthetic file was restored and reverified.
- Legacy listeners are owned by this ops task: archived Next PID 42327 on `127.0.0.1:3002`, archived Python PID 42071 on `127.0.0.1:8002`; both readiness endpoints returned 200. Keep the PIDs/ports coordinated before replacement or shutdown.

## Constraints observed

- No project1 or `erp_migration_20261007` database, `.runtime/migration-baseline/2026-10-07` source files, or original documents were modified.
- No tracked app, test, or configuration code was edited by ops. Ops ran no test suite or migrations. No workers, SMTP, CI, branches, commits, or push operations were started.
- Current checkout still has the pre-existing `M next-env.d.ts` change.

## BFF integration runtime follow-up — 2026-10-23

- Docker daemon server version `29.6.1` was verified; container inventory showed only the healthy `organization-erp-postgres-1` service on port 5434. No extra Compose service was started.
- The BFF phase attached `backend` to `project1_document_data` at `/var/lib/project1/documents` and set the matching `DOCUMENT_STORAGE_ROOT`. Playwright, NextAuth, and the app public URL in private E2E config now use `http://localhost:3001`; Next binds to `127.0.0.1`. The existing same-origin guard was not changed.
- A source-preserved original `DocumentVersion` was downloaded over the new Python HTTP route on owned port 8003 against only `erp_stage08_legacy` and `.runtime/stage08/legacy/documents`. The 200 response's complete bytes matched metadata size and SHA; content-length, ETag, private/no-store, nosniff, and attachment checks passed. Sanitized private result: `.runtime/stage08/python-legacy-http.json` (no source identifier, title or hash repeated here).
- Image-only Compose builds for backend and app were started. The app Compose target is `runner`, avoiding the unrelated default worker target. Build completion and UID/GID 1001, font, and shared-volume write/read smoke on a dedicated owned volume are pending. No real documents volume is mounted.
- The initial ops-only ownership statement above describes pre-BFF work; the subsequent BFF phase did make the scoped tracked route/SSR/transport/Compose changes described in `task-08-bff-report.md`.

## Runtime build and smoke outcome — 2026-10-23

- The combined backend+app runner build failed in backend `uv sync`: three retries over 127.7 seconds ended in a timeout fetching `opentelemetry-exporter-http-transport==0.66b1` from `files.pythonhosted.org`. One retry with cached layers failed at the same wheel after three retries/125.1 seconds. Exact logs: `.runtime/stage08/docker-build.log` and `.runtime/stage08/docker-build-retry.log`.
- One diagnostic backend image build then succeeded using an ignored private copy of `backend/Dockerfile`; the only diff was `UV_HTTP_TIMEOUT=120 UV_CONCURRENT_DOWNLOADS=4` on the existing locked `uv sync` command. The same backend build context/runtime and 53 locked packages were used; no dependency, lockfile, runtime, or tracked Dockerfile changed. Log: `.runtime/stage08/docker-backend-retry-slow-network.log`.
- The backend image passed the achievable isolated smoke: UID/GID 1001, documents-root mode 0700, file mode 0600, DejaVuSans font present, `/api/health/live` 200 and healthy state. Two independent containers of that backend image shared the unique owned volume successfully. This is cross-container filesystem-permission evidence only, not app/backend integration.
- The app-only Compose runner build reached `npm ci` after base packages and UID/GID layer setup, then failed after 116.4 seconds with `npm error network aborted`; log `.runtime/stage08/docker-app-build.log`. No stale Stage07/app image was substituted. A local Next 16.3.4 Webpack production build passed with restored existing `node_modules`; TypeScript, static generation (48/48), and trace collection completed. This is not a Docker image build.
- `next-env.d.ts` and `tsconfig.json` were backed up privately and verified after the local build: SHA-256 values remain the protected originals. The backend smoke container and unique volume were removed. No app/migration/worker/SMTP service or real documents volume was used. Sanitized Compose config confirms matching size limit `26214400`, storage root, and named volume for app/backend; app-container UID/font/health and app↔backend shared-volume integration remain unverified.
