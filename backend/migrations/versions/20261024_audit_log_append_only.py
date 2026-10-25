"""Защитить журнал аудита прежней системы от прямых обновлений и удалений."""

from alembic import op

revision = "20261024_audit_log_append_only"
down_revision = "20261024_legacy_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE FUNCTION reject_audit_log_mutation()\n"
        "RETURNS trigger\n"
        "LANGUAGE plpgsql\n"
        "AS $$\n"
        "BEGIN\n"
        "    RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = '55000';\n"
        "END;\n"
        "$$"
    )
    op.execute(
        """
        CREATE TRIGGER audit_logs_append_only
        BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION reject_audit_log_mutation()
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER audit_logs_append_only ON audit_logs")
    op.execute("DROP FUNCTION reject_audit_log_mutation()")
