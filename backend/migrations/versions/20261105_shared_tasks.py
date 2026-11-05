"""Разрешить задачи без проекта."""

from alembic import op

revision = "20261105_shared_tasks"
down_revision = "20261024_user_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("tasks", "projectId", nullable=True)


def downgrade() -> None:
    # PostgreSQL rejects the downgrade if general tasks still exist; do not delete them.
    op.alter_column("tasks", "projectId", nullable=False)
