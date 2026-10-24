# Stage 14A — Alembic migration handoff

## Ownership and frozen revisions

Alembic is the only migration owner in CI and Compose. The Prisma migration
history remains in `_prisma_migrations`; Prisma generation and the existing Node
seed/CLI are unchanged in this stage.

| Revision | Purpose |
|---|---|
| `20261024_legacy_schema` | Frozen legacy baseline: literal copies of all 41 checked-in Prisma `migration.sql` files, in migration order. It does not import SQLAlchemy metadata or read mutable SQL files at runtime. |
| `20261024_audit_log_append_only` | Adds the database trigger rejecting direct `UPDATE` and `DELETE` on `audit_logs`; inserts remain allowed. |

The frozen inputs are `prisma/schema.prisma` and all 41
`prisma/migrations/**/migration.sql` files. Their SHA-256 values match the
Stage 00 inventory at `docs/backend-migration/schema-inventory.json` (42
inputs checked, 0 changes). The Alembic baseline carries the checked-in SQL
content so future ORM edits cannot change it. `migrations/legacy_catalog.json`
is the pre-stamp expected catalog; `migrations/catalog_baseline.json` is the
final expected catalog after the audit trigger revision.

The verifier reads PostgreSQL catalogs directly. It compares tables and
columns, server defaults, every constraint, every index (including partial and
expression indexes), enum labels, functions, and triggers. It ignores only
Alembic's own version table and Prisma's history table. It does not use ORM
metadata or row-level application data.

## Rehearsal evidence

Both paths used separate, new PostgreSQL 15 Docker Compose projects and named
databases. No connection was made to `project1` or `erp_migration_20261007`.

### Empty path: `org-erp-stage14a-empty-20261024` / `stage14a_empty`

The target was checked with `SELECT current_database()` before each DDL phase.
It was first populated from the checked-in Prisma chain only to create an
independent catalog reference, then its disposable `public` schema was reset.
The actual empty-path rehearsal was:

```sh
BACKEND_DATABASE_URL=<stage14a_empty URL> uv run alembic upgrade head
BACKEND_DATABASE_URL=<stage14a_empty URL> uv run python -m app.scripts.verify_schema
BACKEND_DATABASE_URL=<stage14a_empty URL> uv run python -m app.scripts.seed
BACKEND_DATABASE_URL=<stage14a_empty URL> uv run python -m app.scripts.verify_data
STAGE14A_TEST_DATABASE_URL=<stage14a_empty URL> uv run pytest tests/integration/test_migrations.py -q
```

Results: both revisions upgraded successfully; frozen final catalog matched;
the synthetic demo seed created one connected department, position, employee,
project, membership, task, and assignee; all 12 relational verification
counters were zero; all six focused migration tests passed. The tests attempted
direct SQL `UPDATE` and `DELETE` on fresh audit rows and observed PostgreSQL
errors for both, then rolled their transactions back.

### Existing-copy path: `org-erp-stage14a-existing-20261024` / `stage14a_existing`

The preserved 2026-10-07 source dump was restored into this new disposable
database. Its original schema had 38 recorded Prisma migrations. The remaining
three checked-in migrations (`20260925090000_notification_outbox_lease`,
`20260925120000_add_scheduled_alert_runs`, and
`20260925202046_add_timesheet_approval_workflow`) were applied to the copy, not
to the source dump or another database. Before stamping, the independent legacy
catalog comparison reported zero differences:

```sh
BACKEND_DATABASE_URL=<stage14a_existing URL> uv run python -m app.scripts.verify_schema --legacy
BACKEND_DATABASE_URL=<stage14a_existing URL> uv run alembic stamp 20261024_legacy_schema
BACKEND_DATABASE_URL=<stage14a_existing URL> uv run alembic upgrade head
BACKEND_DATABASE_URL=<stage14a_existing URL> uv run python -m app.scripts.verify_schema
BACKEND_DATABASE_URL=<stage14a_existing URL> uv run alembic check
STAGE14A_TEST_DATABASE_URL=<stage14a_existing URL> uv run pytest tests/integration/test_migrations.py -q
```

Results: `_prisma_migrations` retained all 41 rows; the stamp ran only after
the exact legacy catalog comparison; the audit revision upgraded; the final
catalog matched; all six focused migration tests passed; and `alembic check`
reported no new operations. SQLAlchemy emitted one known warning about the
legacy departments/employees/staff_schedule foreign-key cycle; the independent
catalog verifier checked all foreign keys and constraints anyway.

## Cleanup and operational boundary

Only the two temporary Compose projects were removed, by their exact names:

```sh
docker compose -p org-erp-stage14a-empty-20261024 down --volumes --remove-orphans
docker compose -p org-erp-stage14a-existing-20261024 down --volumes --remove-orphans
```

The checked-in Prisma source and ignored source backup were left unchanged. No
working or existing database was migrated. A production cutover is outside
Stage 14A and requires a separately authorized operation.
