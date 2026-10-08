# Alembic metadata review only

Prisma remains the sole DDL owner through migration stage 13. This directory
only loads SQLAlchemy metadata so the team can compare the mapping with the
current schema. Do not create revisions, stamp a database, or run `upgrade` or
`downgrade` in stages 02–13. In particular, never point schema-changing
commands at `project1` or `erp_migration_20261007`.

The Alembic environment imports the complete registry, excludes Prisma's
`_prisma_migrations` bookkeeping table, and never calls `create_all`. The
standard `alembic check` command can create Alembic's own version table when
there are no revisions, so use the dedicated read-only comparator below.
It requires the exact disposable `erp_stage02_test` database, sets the
PostgreSQL transaction to read-only, and never invokes migration execution.
A comparison may report expected differences for objects that SQLAlchemy
does not map yet; it does not apply those differences. The Alembic environment
guard rejects `check`, `ensure_version`, `upgrade`, `downgrade`, and `stamp`
when those commands load `env.py`. It also rejects `revision --autogenerate`
because autogenerate loads that environment. A plain `alembic revision`
without `--autogenerate` does not load `env.py`, so the guard cannot intercept
it; the stage policy still forbids creating revisions before stage 14. Do not
run it.

```sh
cd backend
BACKEND_DATABASE_URL='postgresql+asyncpg://…/erp_stage02_test' uv run python -m app.db.schema_review
```

A non-zero result means that the current metadata and PostgreSQL catalog
differ; inspect the candidate differences rather than turning them into a
migration. Do not run Alembic revision, upgrade, downgrade, or stamp commands
in stages 02–13. This is a workflow rule; the environment guard cannot block
commands that do not load `env.py`.

Alembic may warn that it cannot sort the departments/employees/staff_schedule
foreign-key cycle and skip those constraints during its comparison. The
integration catalog test separately checks every PostgreSQL foreign key,
including those cyclic relationships.
