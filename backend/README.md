# FastAPI backend

FastAPI owns sessions, authorization, business rules, PostgreSQL access,
documents and notifications. Next.js serves the UI and same-origin BFF only.
Alembic is the only active schema migration owner.

## Local configuration

The root `.env.example` is shared by Compose and host-run Python commands.

| Variable | Purpose |
| --- | --- |
| `BACKEND_DATABASE_URL` | Host-run Python CLI and tests; async SQLAlchemy URL. Use `localhost` and the published dev port from macOS. |
| `BACKEND_TEST_DATABASE_URL` | Dedicated database for integration tests. |
| `BACKEND_CSRF_SECRET` | Python-only signed double-submit CSRF key; 32 bytes or more. |
| `BACKEND_PUBLIC_ORIGIN` | Browser-facing origin used by CSRF checks, not the internal Compose URL. |
| `BACKEND_ENVIRONMENT` | Set `production` to disable interactive API docs. |
| `DOCUMENT_STORAGE_ROOT` | Shared document directory for the backend and Python worker. |
| `BACKEND_OTEL_ENABLED` | Enables optional Python traces and metrics. |

Generate a local CSRF secret with `openssl rand -hex 32`; do not commit it.
Compose services derive their database URL from `POSTGRES_*`. For commands
run on the host, `BACKEND_DATABASE_URL` uses `localhost` and the port published
by `docker-compose.dev.yml`.

## Start locally

From the repository root:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
```

The migration job runs `alembic upgrade head` and verifies the schema before
starting app services. Next.js uses `http://backend:8000` inside Compose. For a
host-run frontend, copy `frontend/.env.example` to `frontend/.env.local` and run
`npm ci` / `npm run dev` from `frontend/`.

The backend API has `/api/health/live`, `/api/health/ready` and `/openapi.json`.
In non-production, `/docs` and `/redoc` are available too.

For a host-run API, from `backend/`:

```sh
uv sync --frozen
uv run --env-file ../.env uvicorn app.main:create_app --factory --reload --port 8000
```

## Alembic and Python CLI

Run commands from `backend/` with `BACKEND_DATABASE_URL` set to the intended
database:

```sh
uv sync --frozen
uv run --env-file ../.env alembic current
uv run --env-file ../.env alembic upgrade head
uv run --env-file ../.env python -m app.scripts.verify_schema
uv run --env-file ../.env python -m app.scripts.seed
uv run --env-file ../.env python -m app.scripts.verify_data
uv run --env-file ../.env python -m app.scripts.create_admin
```

Before using Alembic on an existing legacy database, follow the
[Stage 14A verify-and-stamp handoff](../docs/backend-migration/migration-handoff.md).
Never run the archived Prisma migrations beside Alembic.

## Checks

```sh
uv sync --frozen
uv run ruff check .
uv run ruff format --check .
uv run mypy app
uv run pytest
```

Integration tests require an isolated PostgreSQL database. Do not point tests,
rehearsal commands or a host-run backend at a production database.
