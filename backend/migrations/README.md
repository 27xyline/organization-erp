# Alembic migration ownership

Stage 14A transfers schema DDL ownership to Alembic. Prisma migration history
in `_prisma_migrations` is retained, but Prisma migrations are no longer run by
CI or Compose. Prisma client generation and the legacy Node seed/CLI remain
available until Stage 14D.

The frozen revisions are:

- `20261024_legacy_schema`: static baseline containing the checked-in SQL from
  all 41 legacy Prisma migrations. It does not read current ORM metadata or
  mutable SQL files at runtime.
- `20261024_audit_log_append_only`: database trigger rejecting direct updates
  and deletes from `audit_logs`; application inserts remain allowed.

For a new empty database, run `uv run alembic upgrade head`. For an existing
database, first run `uv run python -m app.scripts.verify_schema --legacy` and
continue only when it reports an exact match. Then stamp the legacy revision
and apply the audit revision:

```sh
uv run alembic stamp 20261024_legacy_schema
uv run alembic upgrade head
uv run python -m app.scripts.verify_schema
uv run alembic check
```

`stamp` records a revision; it does not compare or repair a schema. The
independent verifier compares raw PostgreSQL tables, columns, defaults,
constraints, indexes, enum labels, functions, and triggers against frozen
catalog snapshots. It excludes `_prisma_migrations` and `alembic_version`.
Run these commands only against the intended target after the appropriate
catalog verification. Do not point them at `project1` or
`erp_migration_20261007` as part of a rehearsal.

See [the Stage 14A handoff report](../../docs/backend-migration/migration-handoff.md)
for the two disposable rehearsals, exact targets, and recorded results.
