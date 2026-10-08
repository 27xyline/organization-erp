"""SQLAlchemy mappings for projects tables."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    PrimaryKeyConstraint,
    Text,
    text,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, new_cuid, utc_now_naive
from app.models.enums import ProjectStatus, TaskPriority, TaskRisk, TaskStatus


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="projects_pkey"),
        CheckConstraint(
            '"startDate" IS NULL OR "endDate" IS NULL OR "startDate" <= "endDate"',
            name="projects_date_range",
        ),
        CheckConstraint('"plannedBudget" >= 0', name="projects_plannedBudget_nonnegative"),
        CheckConstraint('"actualBudget" >= 0', name="projects_actualBudget_nonnegative"),
        Index("projects_code_key", "code", unique=True),
    )
    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    code: Mapped[str] = mapped_column(Text(), nullable=False)
    name: Mapped[str] = mapped_column(Text(), nullable=False)
    description: Mapped[str | None] = mapped_column(Text(), nullable=True)
    goals: Mapped[str | None] = mapped_column(Text(), nullable=True)
    tasks: Mapped[str | None] = mapped_column(Text(), nullable=True)
    results: Mapped[str | None] = mapped_column(Text(), nullable=True)
    startDate: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    endDate: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    status: Mapped[ProjectStatus] = mapped_column(
        SAEnum(
            ProjectStatus,
            name="project_status",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        server_default=text("'ACTIVE'"),
    )
    plannedBudget: Mapped[Decimal] = mapped_column(
        Numeric(precision=12, scale=2), nullable=False, server_default=text("0")
    )
    actualBudget: Mapped[Decimal] = mapped_column(
        Numeric(precision=12, scale=2), nullable=False, server_default=text("0")
    )
    plannedRevenue: Mapped[Decimal] = mapped_column(
        Numeric(precision=12, scale=2), nullable=False, server_default=text("0")
    )
    actualRevenue: Mapped[Decimal] = mapped_column(
        Numeric(precision=12, scale=2), nullable=False, server_default=text("0")
    )
    createdAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updatedAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        default=utc_now_naive,
        onupdate=utc_now_naive,
    )


class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="project_members_pkey"),
        Index("project_members_projectId_employeeId_key", "projectId", "employeeId", unique=True),
        Index("project_members_projectId_isArchived_idx", "projectId", "isArchived", unique=False),
        Index(
            "project_members_employeeId_isArchived_idx", "employeeId", "isArchived", unique=False
        ),
    )
    project: Mapped[Any] = relationship("Project", foreign_keys="[ProjectMember.projectId]")
    employee: Mapped[Any] = relationship("Employee", foreign_keys="[ProjectMember.employeeId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    projectId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "projects.id",
            name="project_members_projectId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    employeeId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "employees.id",
            name="project_members_employeeId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    department: Mapped[str] = mapped_column(Text(), nullable=False)
    position: Mapped[str] = mapped_column(Text(), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(precision=5, scale=2), nullable=False)
    salary: Mapped[Decimal] = mapped_column(Numeric(precision=12, scale=2), nullable=False)
    isArchived: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, server_default=text("false")
    )
    archivedAt: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    createdAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updatedAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        default=utc_now_naive,
        onupdate=utc_now_naive,
    )


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="tasks_pkey"),
        CheckConstraint('"level" BETWEEN 1 AND 3', name="tasks_level_range"),
        CheckConstraint('"progress" BETWEEN 0 AND 100', name="tasks_progress_range"),
        CheckConstraint(
            '"startDate" IS NULL OR "endDate" IS NULL OR "startDate" <= "endDate"',
            name="tasks_date_range",
        ),
        Index("tasks_projectId_parentId_idx", "projectId", "parentId", unique=False),
    )
    parent: Mapped[Any] = relationship(
        "Task", foreign_keys="[Task.parentId]", remote_side="[Task.id]"
    )
    project: Mapped[Any] = relationship("Project", foreign_keys="[Task.projectId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    name: Mapped[str] = mapped_column(Text(), nullable=False)
    description: Mapped[str | None] = mapped_column(Text(), nullable=True)
    priority: Mapped[TaskPriority] = mapped_column(
        SAEnum(
            TaskPriority,
            name="task_priority",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        server_default=text("'MEDIUM'"),
    )
    risk: Mapped[TaskRisk] = mapped_column(
        SAEnum(
            TaskRisk,
            name="task_risk",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        server_default=text("'LOW'"),
    )
    isMilestone: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, server_default=text("false")
    )
    level: Mapped[int] = mapped_column(Integer(), nullable=False, server_default=text("1"))
    parentId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey("tasks.id", name="tasks_parentId_fkey", ondelete="SET NULL", onupdate="CASCADE"),
        nullable=True,
    )
    startDate: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    endDate: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    duration: Mapped[int | None] = mapped_column(Integer(), nullable=True)
    progress: Mapped[int] = mapped_column(Integer(), nullable=False, server_default=text("0"))
    responsible: Mapped[str | None] = mapped_column(Text(), nullable=True)
    status: Mapped[TaskStatus] = mapped_column(
        SAEnum(
            TaskStatus,
            name="task_status",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        server_default=text("'NOT_STARTED'"),
    )
    projectId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "projects.id", name="tasks_projectId_fkey", ondelete="CASCADE", onupdate="CASCADE"
        ),
        nullable=False,
    )
    createdAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updatedAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        default=utc_now_naive,
        onupdate=utc_now_naive,
    )


class TaskDependency(Base):
    __tablename__ = "task_dependencies"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="task_dependencies_pkey"),
        CheckConstraint(
            '"predecessorId" <> "successorId"', name="task_dependencies_not_self_check"
        ),
        CheckConstraint('"lagDays" >= 0', name="task_dependencies_lag_check"),
        Index("task_dependencies_successorId_idx", "successorId", unique=False),
        Index(
            "task_dependencies_predecessorId_successorId_key",
            "predecessorId",
            "successorId",
            unique=True,
        ),
    )
    predecessor: Mapped[Any] = relationship("Task", foreign_keys="[TaskDependency.predecessorId]")
    successor: Mapped[Any] = relationship("Task", foreign_keys="[TaskDependency.successorId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    predecessorId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "tasks.id",
            name="task_dependencies_predecessorId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    successorId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "tasks.id",
            name="task_dependencies_successorId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    lagDays: Mapped[int] = mapped_column(Integer(), nullable=False, server_default=text("0"))
    createdAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )


class TaskChecklistItem(Base):
    __tablename__ = "task_checklist_items"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="task_checklist_items_pkey"),
        CheckConstraint('"order" >= 0', name="task_checklist_items_order_check"),
        Index("task_checklist_items_taskId_order_idx", "taskId", "order", unique=False),
    )
    task: Mapped[Any] = relationship("Task", foreign_keys="[TaskChecklistItem.taskId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    taskId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "tasks.id",
            name="task_checklist_items_taskId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(Text(), nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean(), nullable=False, server_default=text("false"))
    order: Mapped[int] = mapped_column(Integer(), nullable=False, server_default=text("0"))
    createdAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updatedAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        default=utc_now_naive,
        onupdate=utc_now_naive,
    )


class TaskComment(Base):
    __tablename__ = "task_comments"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="task_comments_pkey"),
        Index("task_comments_taskId_createdAt_idx", "taskId", "createdAt", unique=False),
        Index("task_comments_authorId_createdAt_idx", "authorId", "createdAt", unique=False),
    )
    task: Mapped[Any] = relationship("Task", foreign_keys="[TaskComment.taskId]")
    author: Mapped[Any] = relationship("User", foreign_keys="[TaskComment.authorId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    taskId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "tasks.id", name="task_comments_taskId_fkey", ondelete="CASCADE", onupdate="CASCADE"
        ),
        nullable=False,
    )
    authorId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "users.id", name="task_comments_authorId_fkey", ondelete="RESTRICT", onupdate="CASCADE"
        ),
        nullable=False,
    )
    body: Mapped[str] = mapped_column(Text(), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updatedAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        default=utc_now_naive,
        onupdate=utc_now_naive,
    )


class TaskAssignee(Base):
    __tablename__ = "task_assignees"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="task_assignees_pkey"),
        Index("task_assignees_taskId_employeeId_key", "taskId", "employeeId", unique=True),
        Index("task_assignees_employeeId_idx", "employeeId", unique=False),
        Index("task_assignees_projectMemberId_idx", "projectMemberId", unique=False),
    )
    task: Mapped[Any] = relationship("Task", foreign_keys="[TaskAssignee.taskId]")
    employee: Mapped[Any] = relationship("Employee", foreign_keys="[TaskAssignee.employeeId]")
    projectMember: Mapped[Any] = relationship(
        "ProjectMember", foreign_keys="[TaskAssignee.projectMemberId]"
    )

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    taskId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "tasks.id", name="task_assignees_taskId_fkey", ondelete="CASCADE", onupdate="CASCADE"
        ),
        nullable=False,
    )
    employeeId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "employees.id",
            name="task_assignees_employeeId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    projectMemberId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "project_members.id",
            name="task_assignees_projectMemberId_fkey",
            ondelete="SET NULL",
            onupdate="CASCADE",
        ),
        nullable=True,
    )
    createdAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
