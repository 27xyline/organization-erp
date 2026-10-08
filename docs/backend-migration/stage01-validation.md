# Stage 01 validation — 8 October 2026

## Scope and ownership

Stage 01 adds an internal FastAPI runtime and its health/test foundation. Next.js remains the owner of business API routes, SSR, worker execution, and Prisma DDL. No business route was switched to Python, no migration was run, and no Alembic setup or business model mapping was added. The Python application and all smoke traffic used `erp_migration_20261007`; PostgreSQL integration tests used the separate `erp_stage01_test`. The original `project1` database was not used by these checks.

The user authorized work on stage 01, closing stage 00's learning pause. Stage 01 now awaits user review and its learning discussion. Stage 02 remains unstarted.

## Files

- Package/runtime: `backend/.python-version`, `backend/pyproject.toml`, `backend/uv.lock`, `backend/Dockerfile`, `backend/README.md`.
- Application: `backend/app/__init__.py`, `backend/app/main.py`, `backend/app/api/{__init__.py,dependencies.py,errors.py,router.py}`, `backend/app/api/routes/{__init__.py,health.py}`, `backend/app/core/{__init__.py,config.py,container.py,context.py,logging.py,middleware.py,observability.py}`, `backend/app/db/{__init__.py,base.py,session.py}`, `backend/app/domain/{__init__.py,errors.py}`, `backend/app/schemas/{__init__.py,common.py}`.
- Tests: `backend/tests/conftest.py`, `backend/tests/unit/test_config.py`, `backend/tests/integration/test_health.py`, `backend/tests/contracts/test_error_envelope.py`, `backend/tests/architecture/test_layers.py`; stage 00 synthetic contract fixtures remain in `backend/tests/contracts/fixtures/`.
- Infrastructure: `docker-compose.yml`, `docker-compose.dev.yml`, `.env.example`, `.gitignore`, `.github/workflows/ci.yml`.
- Plan records: `docs/superpowers/plans/2026-09-28-fastapi/01-foundation.md`, this validation, and `docs/superpowers/plans/2026-09-28-fastapi/08-progress.md`.

The user's existing change in `next-env.d.ts` was preserved; its SHA-256 remained `d55d89a99f49bee7df149125eb311367460827b1d986ae98ca312c9e10caa478`. `tsconfig.json` also retained its initial SHA-256. Next.js generated `AGENTS.md` and `CLAUDE.md` during the smoke run; they were moved into ignored local scratch storage.

## Checks and results

The Python runtime agent ran the locked dependency install and these checks from `backend/` after the final AST resolver correction:

```sh
uv sync --frozen
uv run ruff check .
uv run ruff format --check .
uv run mypy app
BACKEND_TEST_DATABASE_URL=postgresql+asyncpg://<user>:<redacted>@127.0.0.1:5434/erp_stage01_test uv run pytest
```

All passed on Python **3.13.14**. Ruff check and format check covered **29 files**, mypy checked **22 files**, and the final full suite reported **25 passed in 0.32s** against the real PostgreSQL `erp_stage01_test`; it did not substitute SQLite. The tests verify that liveness remains 200 with an unavailable database, readiness returns 503 when unavailable and 200 after `SELECT 1`, the lifespan disposes the engine, and OTEL collector failure does not prevent startup or requests.

An independent architecture review found a gap in AST import normalization for aliased package imports. The focused regression command `UV_CACHE_DIR=/private/tmp/erp-stage01-uv-cache uv run pytest -q tests/architecture/test_layers.py::test_import_checker_resolves_package_imports` initially failed one case while three sibling cases passed. After the resolver fix, `UV_CACHE_DIR=/private/tmp/erp-stage01-uv-cache uv run pytest -q tests/architecture/test_layers.py` passed **7/7**. Ruff check, Ruff format check, mypy, and the full 25-test suite were rerun after that correction.

Infrastructure and HTTP checks:

- `docker compose -f docker-compose.yml -f docker-compose.dev.yml config --quiet` and the observability-profile Compose config passed.
- `docker compose -f docker-compose.yml -f docker-compose.dev.yml build backend` passed and built `organization-erp-backend:latest`.
- Next.js readiness returned **200** on `127.0.0.1:3001` while Python was running on `127.0.0.1:8000`.
- With `BACKEND_ENVIRONMENT=production`, Python live and ready returned **200**, `/openapi.json` returned **200**, and `/docs` and `/redoc` returned **404**. Readiness queried the migration-copy database.
- With `BACKEND_OTEL_ENABLED=true` and no Collector running, Python startup and health checks still passed. Bounded logs showed OTLP retries/export errors, which did not stop the API. Compose is wired to the configured Collector endpoint; successful export to a running Collector was not part of this smoke.
- The runtime CI job was added with Python 3.13, uv frozen install, Ruff, mypy, pytest, and its own PostgreSQL service initialized as `erp_stage01_test`. Remote GitHub Actions CI was not run in this session.

The existing Node/database suite was not rerun. Stage 00's two known outbox failures remain recorded in [baseline validation](baseline-validation.md); stage 01 did not modify or attempt to fix them.

For the smoke test, only the existing Compose PostgreSQL service was started, using its existing volume. `erp_stage01_test` was created because it was absent; no database was dropped, reset, or migrated. The Next and backend processes and the PostgreSQL container started for the checks were stopped afterward. The volume and test database were retained. No rollback of schema changes was needed because stage 01 made none.

## Stage status

Implementation and stated checks are verified. The user still needs to review the stage and discuss the lifespan, dependency injection, settings, and test fixtures. Stage 02 work remains out of scope until the user explicitly authorizes it.
