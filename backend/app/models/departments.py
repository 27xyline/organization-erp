"""Отображения SQLAlchemy для таблиц подразделений."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    PrimaryKeyConstraint,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, new_cuid, utc_now_naive

if TYPE_CHECKING:
    from app.models.employees import Employee


class Department(Base):
    __tablename__ = "departments"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="departments_pkey"),
        CheckConstraint(
            '"parentId" IS NULL OR "parentId" <> "id"', name="departments_parent_not_self"
        ),
        Index("departments_code_key", "code", unique=True),
        Index("departments_name_key", "name", unique=True),
        Index("departments_code_ci_key", text("lower(code)"), unique=True),
        Index("departments_name_ci_key", text("lower(name)"), unique=True),
        Index("departments_parentId_idx", "parentId", unique=False),
        Index("departments_headEmployeeId_idx", "headEmployeeId", unique=False),
        Index("departments_isActive_name_idx", "isActive", "name", unique=False),
    )
    parent: Mapped[Any] = relationship(
        "Department",
        foreign_keys="[Department.parentId]",
        remote_side="[Department.id]",
    )
    headEmployee: Mapped[Any] = relationship("Employee", foreign_keys="[Department.headEmployeeId]")
    employees: Mapped[list[Employee]] = relationship(
        "Employee",
        foreign_keys="[Employee.departmentId]",
        back_populates="departmentRef",
    )

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    code: Mapped[str] = mapped_column(Text(), nullable=False)
    name: Mapped[str] = mapped_column(Text(), nullable=False)
    parentId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "departments.id",
            name="departments_parentId_fkey",
            ondelete="RESTRICT",
            onupdate="CASCADE",
        ),
        nullable=True,
    )
    headEmployeeId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "employees.id",
            name="departments_headEmployeeId_fkey",
            ondelete="SET NULL",
            onupdate="CASCADE",
        ),
        nullable=True,
    )
    isActive: Mapped[bool] = mapped_column(Boolean(), nullable=False, server_default=text("true"))
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
