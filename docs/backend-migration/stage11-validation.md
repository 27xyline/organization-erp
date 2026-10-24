# Stage 11 validation ledger

Stage 11 was verified on branch `fastapi-runtime-foundation`. Database-backed tests use the isolated PostgreSQL database `erp_stage11_test` on PostgreSQL **18.6**. The container remained running; tests did not alter its lifecycle. The private connection file is ignored at `.runtime/stage11/test.env` and is not committed.

## Completed gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Procurement unit, integration, and contract suite | **13 passed** | `cd backend && uv run pytest tests/unit/procurement tests/integration/procurement tests/contracts/procurement -q` |
| Backend Ruff | Passed | `cd backend && uv run ruff check app/api/routes/procurement.py app/domain/procurement app/domain/ports/procurement.py app/repositories/procurement.py app/schemas/procurement.py app/services/dto/procurement.py app/services/procurement.py app/models/procurement.py app/db/uow.py app/domain/ports/uow.py tests/unit/procurement tests/integration/procurement tests/contracts/procurement` |
| Backend mypy | Passed, 9 source files | `cd backend && uv run mypy app/api/routes/procurement.py app/domain/procurement app/domain/ports/procurement.py app/repositories/procurement.py app/schemas/procurement.py app/services/dto/procurement.py app/services/procurement.py app/models/procurement.py` |
| Frontend TypeScript | Passed | `npm run typecheck` |
| Procurement frontend tests | **6 passed / 2 files** | `npm run test -- src/features/procurement` |
| Working-tree whitespace check | Passed | `git diff --check` |

The full-cycle PostgreSQL test verifies approval creation and rollback, repeat-submit rejection without a second approval, contract creation, two partial deliveries and cumulative quantity, audit-failure rollback across asset/holding/operation/link rows, concurrent capitalization with one asset link, and persisted request/asset relations. Other integration tests verify project-scoped document options, archived-document exclusion, full-result summary with pagination, duplicate request-number error mapping, and scoped MOL options/capitalization with no unauthorized asset or delivery link.

The independent Stage 11 review found that capitalization did not enforce the target MOL department scope. The service now checks the `assets.create` target permission and group reference before asset creation; the new PostgreSQL regression covers both denied and allowed departments.

The existing procurement UI page was not changed; all eight Next procurement route files now proxy to the Python API while retaining their permission checks and request validation. TypeScript and procurement frontend tests passed. A browser-level Playwright run of the complete request-to-capitalization journey was not run in this stage.

No schema migration, Docker Compose lifecycle action, or change to `next-env.d.ts` was included in the Stage 11 commit.
