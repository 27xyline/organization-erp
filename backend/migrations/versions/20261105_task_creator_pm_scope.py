"""Сохранять автора задачи и требовать явного назначения проектов руководителю."""

import sqlalchemy as sa
from alembic import op

revision = "20261105_task_creator_pm_scope"
down_revision = "20261105_shared_tasks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("creatorId", sa.Text(), nullable=True))
    op.create_foreign_key(
        "tasks_creatorId_fkey",
        "tasks",
        "users",
        ["creatorId"],
        ["id"],
        ondelete="SET NULL",
        onupdate="CASCADE",
    )
    op.execute("""DELETE FROM "user_project_scopes" WHERE "roleAssignmentId" IN
        (SELECT "id" FROM "user_role_assignments" WHERE "role" = 'PROJECT_MANAGER'
         AND "projectScopeMode" = 'ALL')""")
    op.execute("""UPDATE "user_role_assignments" SET "projectScopeMode" = 'ASSIGNED'
        WHERE "role" = 'PROJECT_MANAGER' AND "projectScopeMode" = 'ALL'""")


def downgrade() -> None:
    op.drop_constraint("tasks_creatorId_fkey", "tasks", type_="foreignkey")
    op.drop_column("tasks", "creatorId")
