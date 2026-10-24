# Python backend foundation

The Python service is an internal API on port `8000`. In Compose, only the dev overlay publishes it, bound to `127.0.0.1`. Next.js serves the frontend and same-origin BFF; Python owns browser sessions and actor resolution.

## Configuration

The backend reads these environment variables:

| Variable | Purpose |
| --- | --- |
| `BACKEND_DATABASE_URL` | Async PostgreSQL connection used by the application. Local Compose defaults to the prepared `erp_migration_20261007` copy. |
| `BACKEND_TEST_DATABASE_URL` | Separate PostgreSQL database for integration tests, such as `erp_stage01_test`. |
| `BACKEND_BRIDGE_SECRET` | Private HS256 key used only for short-lived Next.js-to-Python actor tokens; at least 32 bytes. |
| `BACKEND_INTERNAL_AUTH_SECRET` | Separate private bearer secret used only by Next.js for the internal credential-auth endpoint; at least 32 bytes. |
| `BACKEND_CSRF_SECRET` | Separate private HMAC key for signed double-submit CSRF tokens; at least 32 bytes and distinct from the other backend secrets. |
| `BACKEND_PUBLIC_ORIGIN` | Public browser origin used to validate unsafe session-cookie requests. It must match the browser-facing origin, not the internal Compose backend URL. |
| `BACKEND_BASE_URL` | Next.js server-side address for the backend, usually `http://backend:8000` in Compose and `http://127.0.0.1:8000` for host tests. |
| `BACKEND_ENVIRONMENT` | Runtime environment; use `production` to disable the interactive API documentation pages. |
| `BACKEND_OTEL_ENABLED` | Enables OpenTelemetry traces and metrics; Compose defaults to `true`. |
| `BACKEND_OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP HTTP base endpoint for traces and metrics; defaults to the Compose collector address. |

Keep the backend URLs pointed at the isolated migration/test databases. Do not point them at the original `project1` database. For direct host execution, use `127.0.0.1` and the published PostgreSQL port; inside Compose, use the `postgres` service name.

For Stage 14B, `POST /api/auth/login` creates an opaque eight-hour session whose SHA-256 hash alone is persisted. Python checks expiry, revocation, active-user state, and `sessionVersion` on every request. `GET /api/account/me` is the Next.js server and BFF actor source; it is fetched with the incoming cookie and `no-store`. Password, role/scope, and deactivation changes invalidate sessions through the existing `sessionVersion` field. Unsafe browser requests require a signed CSRF cookie/header pair; when `Origin` is present it must match `BACKEND_PUBLIC_ORIGIN`. `BACKEND_BRIDGE_SECRET`, `BACKEND_INTERNAL_AUTH_SECRET`, and `BACKEND_CSRF_SECRET` must be different, at least 32 bytes, and never committed. Missing or invalid auth configuration fails closed.

For a clean checkout, create schema-only `erp_stage03_test` and `erp_stage03_e2e` databases from the prepared `erp_migration_20261007` schema. The test database is used by Python integration tests. The E2E database is shared by Prisma and Python so session-version checks see the same users. Use a private ignored environment file with mode `0600`; never copy a live source-database URL into it. Required values are:

| File | Required database values | Required secrets |
| --- | --- | --- |
| `.runtime/stage03/test.env` | `STAGE03_TEST_DATABASE_URL`, `BACKEND_TEST_DATABASE_URL`, and `BACKEND_DATABASE_URL` point to `erp_stage03_test` | distinct `BACKEND_BRIDGE_SECRET`, `BACKEND_INTERNAL_AUTH_SECRET`, and `BACKEND_CSRF_SECRET`; `BACKEND_PUBLIC_ORIGIN` |
| `.runtime/stage03/e2e.env` | `DATABASE_URL` and `STAGE03_TEST_DATABASE_URL` are identical native PostgreSQL URLs for `erp_stage03_e2e`; `BACKEND_DATABASE_URL` targets that same database with the `postgresql+asyncpg` driver | distinct `BACKEND_BRIDGE_SECRET`, `BACKEND_INTERNAL_AUTH_SECRET`, and `BACKEND_CSRF_SECRET`; `BACKEND_PUBLIC_ORIGIN` |

Generate each secret privately with `openssl rand -hex 32`. For the E2E file, set `NEXTAUTH_URL` and `PLAYWRIGHT_BASE_URL` to `http://localhost:3001` and `PLAYWRIGHT_BACKEND_URL` to `http://127.0.0.1:8000`. Keeping the browser host on `localhost` matches the origin used by Next.js dev mode.

Run the checks from the repository root:

```sh
(cd backend && uv run --env-file ../.runtime/stage03/test.env pytest)

node --env-file=.runtime/stage03/e2e.env node_modules/@playwright/test/cli.js test
```

The Playwright configuration starts Next.js and Python on the host and rejects a missing/mismatched shared E2E database or missing/identical bridge secrets before startup. Keep these environment files private and ignored by Git.

## Run locally

With the repository `.env` configured, start PostgreSQL and the services from the repository root:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build backend
```

The backend is available at `http://127.0.0.1:8000`. To run it directly on the host, install the locked dependencies from this directory and set `BACKEND_DATABASE_URL` to the host-published PostgreSQL address:

```sh
uv sync --frozen
uv run uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000
```

The API exposes `/api/health/live`, `/api/health/ready`, and `/openapi.json`. In non-production environments, `/docs` and `/redoc` are enabled. In production, `/openapi.json` remains available while `/docs` and `/redoc` are disabled.

## Checks

From `backend/`, run the same checks used by the independent `backend-verify` CI job:

```sh
uv sync --frozen
uv run ruff check .
uv run ruff format --check .
uv run mypy app
uv run pytest
```

Integration tests use `BACKEND_TEST_DATABASE_URL` and real PostgreSQL. Keep it separate from both the application migration copy and the original project database.
