"""SQLAlchemy mappings for users tables."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
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
from app.models.enums import AppRole, ScopeMode, UserRole


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="users_pkey"),
        Index("users_username_key", "username", unique=True),
        Index("users_isActive_role_idx", "isActive", "role", unique=False),
        Index("users_employeeId_key", "employeeId", unique=True),
    )
    employee: Mapped[Any] = relationship("Employee", foreign_keys="[User.employeeId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    username: Mapped[str] = mapped_column(Text(), nullable=False)
    name: Mapped[str] = mapped_column(Text(), nullable=False)
    passwordHash: Mapped[str] = mapped_column(Text(), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(
            UserRole,
            name="user_role",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        server_default=text("'VIEWER'"),
    )
    isActive: Mapped[bool] = mapped_column(Boolean(), nullable=False, server_default=text("true"))
    mustChangePassword: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, server_default=text("true")
    )
    sessionVersion: Mapped[int] = mapped_column(Integer(), nullable=False, server_default=text("1"))
    passwordChangedAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    failedLoginAttempts: Mapped[int] = mapped_column(
        Integer(), nullable=False, server_default=text("0")
    )
    lockedUntil: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    lastLoginAt: Mapped[datetime | None] = mapped_column(
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
    employeeId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "employees.id", name="users_employeeId_fkey", ondelete="SET NULL", onupdate="CASCADE"
        ),
        nullable=True,
    )


class UserRoleAssignment(Base):
    __tablename__ = "user_role_assignments"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="user_role_assignments_pkey"),
        Index("user_role_assignments_userId_role_key", "userId", "role", unique=True),
        Index("user_role_assignments_userId_role_idx", "userId", "role", unique=False),
    )
    user: Mapped[Any] = relationship("User", foreign_keys="[UserRoleAssignment.userId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    userId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "users.id",
            name="user_role_assignments_userId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    role: Mapped[AppRole] = mapped_column(
        SAEnum(
            AppRole,
            name="app_role",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    departmentScopeMode: Mapped[ScopeMode] = mapped_column(
        SAEnum(
            ScopeMode,
            name="scope_mode",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        server_default=text("'NONE'"),
    )
    projectScopeMode: Mapped[ScopeMode] = mapped_column(
        SAEnum(
            ScopeMode,
            name="scope_mode",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        server_default=text("'NONE'"),
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


class UserDepartmentScope(Base):
    __tablename__ = "user_department_scopes"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="user_department_scopes_pkey"),
        Index(
            "user_department_scopes_roleAssignmentId_departmentId_key",
            "roleAssignmentId",
            "departmentId",
            unique=True,
        ),
        Index(
            "user_department_scopes_departmentId_roleAssignmentId_idx",
            "departmentId",
            "roleAssignmentId",
            unique=False,
        ),
    )
    roleAssignment: Mapped[Any] = relationship(
        "UserRoleAssignment", foreign_keys="[UserDepartmentScope.roleAssignmentId]"
    )
    department: Mapped[Any] = relationship(
        "Department", foreign_keys="[UserDepartmentScope.departmentId]"
    )

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    roleAssignmentId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "user_role_assignments.id",
            name="user_department_scopes_roleAssignmentId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    departmentId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "departments.id",
            name="user_department_scopes_departmentId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    createdAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )


class UserProjectScope(Base):
    __tablename__ = "user_project_scopes"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="user_project_scopes_pkey"),
        Index(
            "user_project_scopes_roleAssignmentId_projectId_key",
            "roleAssignmentId",
            "projectId",
            unique=True,
        ),
        Index(
            "user_project_scopes_projectId_roleAssignmentId_idx",
            "projectId",
            "roleAssignmentId",
            unique=False,
        ),
    )
    roleAssignment: Mapped[Any] = relationship(
        "UserRoleAssignment", foreign_keys="[UserProjectScope.roleAssignmentId]"
    )
    project: Mapped[Any] = relationship("Project", foreign_keys="[UserProjectScope.projectId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    roleAssignmentId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "user_role_assignments.id",
            name="user_project_scopes_roleAssignmentId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    projectId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "projects.id",
            name="user_project_scopes_projectId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    createdAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="audit_logs_pkey"),
        Index("audit_logs_userId_createdAt_idx", "userId", "createdAt", unique=False),
        Index(
            "audit_logs_entityType_entityId_createdAt_idx",
            "entityType",
            "entityId",
            "createdAt",
            unique=False,
        ),
    )
    user: Mapped[Any] = relationship("User", foreign_keys="[AuditLog.userId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    userId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "users.id", name="audit_logs_userId_fkey", ondelete="SET NULL", onupdate="CASCADE"
        ),
        nullable=True,
    )
    action: Mapped[str] = mapped_column(Text(), nullable=False)
    entityType: Mapped[str] = mapped_column(Text(), nullable=False)
    entityId: Mapped[str] = mapped_column(Text(), nullable=False)
    details: Mapped[Any | None] = mapped_column(JSONB(none_as_null=True), nullable=True)
    requestId: Mapped[str | None] = mapped_column(Text(), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
