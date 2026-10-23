# SDD ledger — plan: docs/superpowers/plans/2026-09-28-fastapi/02-business-modules.md

Scope for this assigned implementer: Stage 07 BFF/SSR/ops/E2E/docs only. Earlier stages are complete; Stage 08 remains unstarted. No commits or branches; root owns final commit.

Ruling: Docker daemon is unavailable at /Users/mac/.docker/run/docker.sock; do not retry/start Docker per parent assignment — PostgreSQL provisioning, database-backed capture, container gates and Playwright DB flows remain blocked until daemon is available; no database source was mutated.

Preflight: reviewer supplied method/transport map; parent ruled that procurement capitalization retains its one legacy TS AssetService.create callback under a named transitional adapter until Stage 11; all public asset routes and SSR callers switch to Python with no fallback; only assets/operations branches of /api/export switch in Stage 07.


## Stage 07 closed; Stage 08 authorized 2026-10-23

Task 7: complete (commits 6a7b63a..d8fc6c3, review clean). Final gates and corrected operational history are in committed stage07-validation.md; earlier blocked notes above are historical, not current.

Stage 08 BASE: d8fc6c34a039509c1783076be0e71cead6f96000. Task 8: preflight. User requested only Stage 08; Stage 09 is not authorized. Continue in existing branch, preserve next-env.d.ts.

| Stage08 task/interface | Produces/consumes | Conflict scan |
| --- | --- | --- |
| Upload/version metadata and storage | staged/final file plus document/version/currentVersion | One DB UoW; FS is separate; explicit failure cleanup/recovery required |
| Storage/file policy/download | existing keys, bytes, MIME, hash, private access | Must support existing files while rejecting traversal/symlinks; operate on copies |
| Rendering/service/API | generated DOCX/PDF then version workflow | Rendering outside event loop and DB transaction, revalidate authority before write |
| API/BFF/SSR/workspace | multipart/download contracts and typed metadata reads | Backend first; BFF edits sequential after agreed contracts; no fallback |
| Version uniqueness/concurrency | same document current pointer and version number | lock/revalidate before next number, test two physical PG connections |
| Size-limit tests and learning exercise | mandatory file-policy verification vs independent exercise | Mandatory size tests remain; choose separate unimplemented exercise variant at completion |

Ruling: no new data technologies, migrations, worker or Stage09 workflows. Existing composite callers must be inventoried before switching; do not split a mutation across TS and Python. New source conflicts go to preflight report before implementation.

### Stage 08 source preflight rulings

Ruling: actual upload protocol is raw binary + bounded base64url x-document-metadata, not multipart. Preserve source protocol and byte-safe proxy; do not add an unused API.
Ruling: currentVersion is an integer backed by a deferred DB constraint trigger, and version rows have an immutable trigger. Preserve both; no DDL.
Ruling: TS approval status/lockVersion writes stay inside their existing approval transaction until Stage09 as an explicit temporary writer exception; do not introduce HTTP-distributed mutation or migrate Stage09. Python document mutations revalidate under compatible locks. Procurement remains metadata/link reader outside08.
Ruling: preserve extension/declared-MIME source policy; no unsolicited content-sniffing redesign. Actual generated templates have no tables; preserve paragraph layout and Cyrillic output, not invented tables.
Ruling: FS recovery cannot delete a possibly committed file after ambiguous DB commit; reconcile against DB references. No new scheduled worker in08.
Preflight complete: task-08-preflight-report.md; ops snapshots copied 66 files, 15980 bytes with matching SHA/path/size. Docker absent; user asynchronously asked to start it. Core backend sole code implementer; ops currently finished prep, BFF phase starts only after backend task review.

Task 8 backend: fix round 1/5 started; task review requires changes F1 unresolved COMMIT fence, F2 offloaded cancellation, F3 effective root/ancestor pinning, F4 interrupted journals, F5 dependency direction/typed records. Author stage08_backend owns all corrections; BFF phase not started. Report task-08-backend-review.md, before-fix snapshot task-08-backend-before-fix1.json.

Task 8 backend: fix round 1/5 (4 addressed, 1 open — F4 new journal publication before lease race; uncommitted d8fc6c3 worktree).
Task 8 backend: fix round 2/5 started; only F4 journal publication/lease race and covering barrier regression, original author.

Task 8 backend: fix round 2/5 (1 addressed, 0 open — F4 publication lease race closed; uncommitted d8fc6c3 worktree).
Task 8 backend: complete (review clean, backend commit pending).
Task 8 BFF/integration: starts after backend commit; sole implementation agent stage08_ops.

Task 8 backend: complete (commits d8fc6c3..332ee33, review clean).
Task 8 BFF/integration: implementation dispatched to stage08_ops (Luna High), BASE 332ee335e8b46c339b140527601bbd45b3004a34; no concurrent authors, commit reserved until task-review PASS.

Ruling: final whole-change review uses Stage08 baseline d8fc6c3, not the entire historical migration branch — user authorized only08 and prior stages are already reviewed; risk if wrong is an earlier-stage defect not re-audited here. The multi-stage plan workspace is retained for later authorized stages, not deleted while09+ remain unstarted.

Ruling: preserve prisma/demo-seed.ts as explicit fixture-only document/storage writer after retiring runtime TS document service — necessary for existing demo seed, not imported by runtime; risk if wrong is a script caller bypassing Python outside fixture setup, tracked in ownership.

## Stage 08 BFF and validation update — 2026-10-23

The historical Stage 07-only scope and earlier “Docker unavailable / Stage 08 unstarted” text above are superseded by the 2026-10-23 Stage 08 authorization and this update. Backend implementation is committed at `332ee335` and task-reviewed PASS; the BFF is implemented by the sole BFF owner and frozen for review. The active Stage 08 diff is based on `d8fc6c3`; no Stage 09 work has started.

Current BFF gates: full Vitest 273 passed/5 skipped; tsc and changed-file ESLint pass; full Playwright 11/11 including UI upload/version/download-hash/archive/denial; final backend pytest 279/279. Detailed commands, endpoints, ownership exceptions and evidence are in `task-08-bff-report.md`, with backend contract and storage evidence in `task-08-backend-report.md` and private operations details in `task-08-ops-report.md`.

Ownership after the cutover: Python owns document application/API/storage/rendering. TypeScript keeps only the read-only adapter for health/integrity checks, approval status writes inside their existing TS transaction until Stage 09, and existing procurement/global-search metadata reads. `prisma/demo-seed.ts` is a fixture-only writer exception, used only by the one-time demo seeder. No TypeScript document service or runtime storage writer remains.

Remaining Stage 08 integration gates are the Docker backend/app-runner build plus UID/font/shared-volume smoke on a dedicated volume, and a Python HTTP download/hash comparison for existing original versions through the source-preserving private legacy copy. The earlier 66/66 adapter byte verification and old TypeScript HTTP capture do not substitute for the Python HTTP gate. Preserve source DB/files and do not reset any Stage 08 database while tests or captures are in flight.

The learning pause is an optional walkthrough of authorization → filesystem bytes → immutable version metadata → verified stream → archive; size limits remain mandatory and are already covered by tests. Stage 09 is not started.

Task 8 BFF: fix round 1/5 started; B1 E2E storage containment, B2 Compose max-size propagation, B3 fixture-seed safe writes. task-08-bff-review.md; original author stage08_ops.
Task 8 BFF: minor deferred — internal item DTOs are compile-time casts; report wording should say envelope validation; PDF byte fixture is transport coverage only, real rendering separately verified. Generated Next AGENTS/CLAUDE files require provenance+move to ignored runtime.

Task 8 BFF: fix round 1/5 (3 addressed, 0 open — storage isolation, size env, fixture writer; frozen uncommitted worktree since332ee33).
Task 8 BFF: code review clean; runtime Docker acceptance still pending network image/dependency downloads. Minor deferred: existing fixture shard chmod polish.
Ruling: run final Stage08 code review while Docker network acceptance is pending — no code changes expected from image downloads, stage completion still requires truthful runtime result; risk is a later runtime-discovered fix requiring scoped re-review.

### Stage 08 closeout update — 2026-10-23

Task 8 BFF: fix round 1 and code/spec reviews clean; implementation and docs frozen. Focused review-fix tests 9/9, changed-file lint, TypeScript and documents-only Playwright 1/1 pass. Whole Stage08 gates remain as recorded: Python 279/279; Vitest 273 passed/5 skipped; full Playwright 11/11; docs-only rerun 1/1. See `task-08-bff-report.md` for commands and evidence.

Runtime: backend image built with a private build-time-only uv timeout/concurrency override and passed UID/GID 1001, font, health 200, and same-image cross-container volume read/write. App runner Docker build remains blocked by npm network abort; local Next Webpack production build passed. App↔backend container shared-volume check is unverified. No app/migration/worker/SMTP service or real documents volume was used. Stage 09 remains not started.
