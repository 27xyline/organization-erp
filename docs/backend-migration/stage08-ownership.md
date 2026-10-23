# Stage 08 ownership — documents

Status: implemented and code/spec reviewed. The app Docker runtime integration gate remains blocked by package-network failures; see [Stage 08 validation](stage08-validation.md).

Python owns the nine document API operations and document reads used by SSR: document index/detail and project workspace composition. It owns document authorization, metadata/version mutations, filesystem storage, rendering, and streamed downloads. Next route handlers remain the browser BFF and preserve the established contracts.

The remaining TypeScript exceptions are deliberately narrow:

- Approval status and `lockVersion` writes remain inside the existing TypeScript approval transaction until Stage 09.
- Procurement and global search remain metadata readers; they do not gain new document mutation APIs.
- `prisma/demo-seed.ts` may write only fixture/demo files through the contained, exclusive-promotion seed helper; it is not imported by runtime routes.
- The TypeScript document-storage adapter is read-only and remains for `/api/health/ready` and `scripts/verify-data.ts`.

Verification: backend Python 279 passed; Vitest 273 passed/5 skipped; Stage 08 review-fix tests 9 passed; Playwright 11 passed plus the documents-only rerun 1 passed; TypeScript and changed-file ESLint passed. Local Next 16.3.4 Webpack production build passed. Backend commit: `332ee33`; BFF/docs commit: `6aca5d6`.

The backend image was smoke-tested as UID/GID 1001 with a 0700 storage root, 0600 files, font present, health 200, and same-image cross-container owned-volume reads/writes. The app runner image build failed at `npm ci` with a network abort, so app-container runtime and app↔backend volume integration remain unverified. Stage 09 is not started.
