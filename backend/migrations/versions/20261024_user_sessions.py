"""Добавить браузерные сессии с непрозрачными токенами под управлением Python."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20261024_user_sessions"
down_revision = "20261024_audit_log_append_only"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("userId", sa.Text(), nullable=False),
        sa.Column("tokenHash", sa.Text(), nullable=False),
        sa.Column("sessionVersion", sa.Integer(), nullable=False),
        sa.Column("expiresAt", postgresql.TIMESTAMP(precision=3), nullable=False),
        sa.Column("revokedAt", postgresql.TIMESTAMP(precision=3), nullable=True),
        sa.Column(
            "createdAt",
            postgresql.TIMESTAMP(precision=3),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="user_sessions_pkey"),
        sa.ForeignKeyConstraint(
            ["userId"], ["users.id"], name="user_sessions_userId_fkey", ondelete="CASCADE"
        ),
    )
    op.create_index("user_sessions_tokenHash_key", "user_sessions", ["tokenHash"], unique=True)
    op.create_index("user_sessions_userId_expiresAt_idx", "user_sessions", ["userId", "expiresAt"])


def downgrade() -> None:
    op.drop_index("user_sessions_userId_expiresAt_idx", table_name="user_sessions")
    op.drop_index("user_sessions_tokenHash_key", table_name="user_sessions")
    op.drop_table("user_sessions")
