# Stage 11 ownership — procurement

FastAPI owns supplier creation, supplier INN validation, procurement request list/detail/create/update, approval submission, contract creation, deliveries, and capitalization. The business flow is implemented by `ProcurementService`; request/approval, request/delivery, and asset/holding/receipt/audit writes share the caller-owned Unit of Work.

Python routes:

- `GET` and `POST /api/procurement`
- `GET /api/procurement/options`
- `POST /api/procurement/suppliers`
- `GET` and `PUT /api/procurement/{id}`
- `POST /api/procurement/{id}/submit`
- `POST /api/procurement/{id}/contract`
- `POST /api/procurement/{id}/deliveries`
- `POST /api/procurement/delivery-items/{id}/capitalize`

All eight existing Next route files keep the browser URLs, permission gates, and Zod validation, then forward to FastAPI through the Stage 11 BFF helper. The existing `/procurement` UI keeps its request, approval, contract, delivery, and capitalization forms; its production callers use the stable BFF URLs. The former TypeScript service remains as an unused legacy module and its own unit-test target; the procurement route handlers no longer import it.

Document references are checked through Stage 08 `DocumentRepository.get` with `documents.read` access and allowed document states. Procurement options obtain documents through the same repository's scope-filtered list, excluding archived documents. MOL options are filtered by `assets.create` department scope; capitalization checks the selected MOL's department and validates the supplied or inherited asset group before creating the asset. Request pagination and the summary are computed across the full filtered result before the page slice.

The SQLAlchemy model adds workflow relationships only; no schema migration is introduced. Prisma schema/migrations remain the DDL owner. Detailed verification and known limits are recorded in [stage11-validation.md](stage11-validation.md).
