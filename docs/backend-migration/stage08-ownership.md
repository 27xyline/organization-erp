# Stage 08 ownership — documents

Status: implemented, code/spec reviewed, and Docker runtime integration gates passed; see [Stage 08 validation](stage08-validation.md).

Python owns the nine document API operations and document reads used by SSR: document index/detail and project workspace composition. It owns document authorization, metadata/version mutations, filesystem storage, rendering, and streamed downloads. Next route handlers remain the browser BFF and preserve the established contracts.

The remaining TypeScript exceptions are deliberately narrow:

- Approval status and `lockVersion` writes remain inside the existing TypeScript approval transaction until Stage 09.
- Procurement and global search remain metadata readers; they do not gain new document mutation APIs.
- `prisma/demo-seed.ts` may write only fixture/demo files through the contained, exclusive-promotion seed helper; it is not imported by runtime routes.
- The TypeScript document-storage adapter is read-only and remains for `/api/health/ready` and `scripts/verify-data.ts`.

Verification: backend Python 279 passed; Vitest 273 passed/5 skipped; Stage 08 review-fix tests 9 passed; Playwright 11 passed plus the documents-only rerun 1 passed; TypeScript and changed-file ESLint passed. Local Next 16.3.4 Webpack production build passed. Backend commit: `332ee33`; BFF/docs commit: `6aca5d6`.

Both standard Compose images built successfully. App and backend readiness passed on the isolated Stage 08 E2E database; an authenticated app document-list request returned 200 through the Python bridge. App and backend ran as UID/GID 1001, and a cross-image read/write probe passed on a new named documents volume. The backend font was present. The initial app build's `npm ci` network abort did not recur on the authorized Docker retry. Stage 09 is not started.
