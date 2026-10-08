# Python backend foundation

The Python service is an internal API on port `8000`. In Compose, only the dev overlay publishes it, bound to `127.0.0.1`; the existing Next.js app stays on port `3001` and remains the production API owner during this stage.

## Configuration

The backend reads these environment variables:

| Variable | Purpose |
| --- | --- |
| `BACKEND_DATABASE_URL` | Async PostgreSQL connection used by the application. Local Compose defaults to the prepared `erp_migration_20261007` copy. |
| `BACKEND_TEST_DATABASE_URL` | Separate PostgreSQL database for integration tests, such as `erp_stage01_test`. |
| `BACKEND_ENVIRONMENT` | Runtime environment; use `production` to disable the interactive API documentation pages. |
| `BACKEND_OTEL_ENABLED` | Enables OpenTelemetry export when set to `true`. |
| `BACKEND_OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP HTTP endpoint; defaults to the Compose collector address. |

Keep the backend URLs pointed at the isolated migration/test databases. Do not point them at the original `project1` database. For direct host execution, use `127.0.0.1` and the published PostgreSQL port; inside Compose, use the `postgres` service name.

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
