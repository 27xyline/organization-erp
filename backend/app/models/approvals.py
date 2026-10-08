"""SQLAlchemy mappings for approvals tables."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    PrimaryKeyConstraint,
    Text,
    text,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, new_cuid, utc_now_naive
from app.models.enums import ApprovalRequestStatus, ApprovalStepStatus


class ApprovalRequest(Base):
    __tablename__ = "approval_requests"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="approval_requests_pkey"),
        CheckConstraint('"currentStep" >= 0', name="approval_requests_current_step_check"),
        CheckConstraint('"lockVersion" >= 1', name="approval_requests_lock_version_check"),
        Index(
            "approval_requests_requestedById_status_createdAt_idx",
            "requestedById",
            "status",
            "createdAt",
            unique=False,
        ),
        Index("approval_requests_status_dueAt_idx", "status", "dueAt", unique=False),
        Index("approval_requests_documentId_idx", "documentId", unique=False),
        Index("approval_requests_projectId_idx", "projectId", unique=False),
        Index("approval_requests_entityType_entityId_idx", "entityType", "entityId", unique=False),
    )
    requestedBy: Mapped[Any] = relationship("User", foreign_keys="[ApprovalRequest.requestedById]")
    document: Mapped[Any] = relationship("Document", foreign_keys="[ApprovalRequest.documentId]")
    project: Mapped[Any] = relationship("Project", foreign_keys="[ApprovalRequest.projectId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    title: Mapped[str] = mapped_column(Text(), nullable=False)
    description: Mapped[str | None] = mapped_column(Text(), nullable=True)
    entityType: Mapped[str | None] = mapped_column(Text(), nullable=True)
    entityId: Mapped[str | None] = mapped_column(Text(), nullable=True)
    status: Mapped[ApprovalRequestStatus] = mapped_column(
        SAEnum(
            ApprovalRequestStatus,
            name="approval_request_status",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        server_default=text("'DRAFT'"),
    )
    currentStep: Mapped[int] = mapped_column(Integer(), nullable=False, server_default=text("0"))
    dueAt: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    submittedAt: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    completedAt: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    lockVersion: Mapped[int] = mapped_column(Integer(), nullable=False, server_default=text("1"))
    requestedById: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "users.id",
            name="approval_requests_requestedById_fkey",
            ondelete="RESTRICT",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    documentId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "documents.id",
            name="approval_requests_documentId_fkey",
            ondelete="SET NULL",
            onupdate="CASCADE",
        ),
        nullable=True,
    )
    projectId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "projects.id",
            name="approval_requests_projectId_fkey",
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
    updatedAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        default=utc_now_naive,
        onupdate=utc_now_naive,
    )


class ApprovalStep(Base):
    __tablename__ = "approval_steps"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="approval_steps_pkey"),
        CheckConstraint('"sequence" > 0', name="approval_steps_sequence_check"),
        Index(
            "approval_steps_approverId_status_createdAt_idx",
            "approverId",
            "status",
            "createdAt",
            unique=False,
        ),
        Index("approval_steps_requestId_status_idx", "requestId", "status", unique=False),
        Index("approval_steps_requestId_sequence_key", "requestId", "sequence", unique=True),
    )
    request: Mapped[Any] = relationship("ApprovalRequest", foreign_keys="[ApprovalStep.requestId]")
    approver: Mapped[Any] = relationship("User", foreign_keys="[ApprovalStep.approverId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    sequence: Mapped[int] = mapped_column(Integer(), nullable=False)
    name: Mapped[str] = mapped_column(Text(), nullable=False)
    status: Mapped[ApprovalStepStatus] = mapped_column(
        SAEnum(
            ApprovalStepStatus,
            name="approval_step_status",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        server_default=text("'WAITING'"),
    )
    comment: Mapped[str | None] = mapped_column(Text(), nullable=True)
    decidedAt: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    dueDate: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    reminderSent: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, server_default=text("false")
    )
    requestId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "approval_requests.id",
            name="approval_steps_requestId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    approverId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "users.id",
            name="approval_steps_approverId_fkey",
            ondelete="RESTRICT",
            onupdate="CASCADE",
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


class ApprovalTemplate(Base):
    __tablename__ = "approval_templates"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="approval_templates_pkey"),
        Index("approval_templates_name_key", "name", unique=True),
        Index("approval_templates_isActive_name_idx", "isActive", "name", unique=False),
    )
    createdBy: Mapped[Any] = relationship("User", foreign_keys="[ApprovalTemplate.createdById]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    name: Mapped[str] = mapped_column(Text(), nullable=False)
    steps: Mapped[Any] = mapped_column(JSONB(), nullable=False)
    isActive: Mapped[bool] = mapped_column(Boolean(), nullable=False, server_default=text("true"))
    createdById: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "users.id",
            name="approval_templates_createdById_fkey",
            ondelete="RESTRICT",
            onupdate="CASCADE",
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
