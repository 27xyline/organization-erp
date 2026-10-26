"""Отображения SQLAlchemy для таблиц справочников."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    ForeignKey,
    Index,
    PrimaryKeyConstraint,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, new_cuid, utc_now_naive


class Mol(Base):
    __tablename__ = "mols"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="mols_pkey"),
        Index("mols_code_key", "code", unique=True),
        Index("mols_departmentId_idx", "departmentId", unique=False),
        Index("mols_employeeId_key", "employeeId", unique=True),
    )
    departmentRef: Mapped[Any] = relationship("Department", foreign_keys="[Mol.departmentId]")
    employee: Mapped[Any] = relationship("Employee", foreign_keys="[Mol.employeeId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    code: Mapped[str] = mapped_column(Text(), nullable=False)
    department: Mapped[str] = mapped_column(Text(), nullable=False)
    departmentId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "departments.id", name="mols_departmentId_fkey", ondelete="RESTRICT", onupdate="CASCADE"
        ),
        nullable=False,
    )
    fullName: Mapped[str] = mapped_column(Text(), nullable=False)
    storageLocation: Mapped[str] = mapped_column(Text(), nullable=False)
    photo: Mapped[str | None] = mapped_column(Text(), nullable=True)
    employeeId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "employees.id", name="mols_employeeId_fkey", ondelete="SET NULL", onupdate="CASCADE"
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


class AssetGroup(Base):
    __tablename__ = "asset_groups"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="asset_groups_pkey"),
        Index("asset_groups_name_key", "name", unique=True),
        Index("asset_groups_code_key", "code", unique=True),
    )
    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    name: Mapped[str] = mapped_column(Text(), nullable=False)
    code: Mapped[str] = mapped_column(Text(), nullable=False)
    description: Mapped[str | None] = mapped_column(Text(), nullable=True)
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


class Supplier(Base):
    __tablename__ = "suppliers"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="suppliers_pkey"),
        Index("suppliers_taxId_key", "taxId", unique=True),
        Index("suppliers_isActive_name_idx", "isActive", "name", unique=False),
    )
    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    name: Mapped[str] = mapped_column(Text(), nullable=False)
    taxId: Mapped[str | None] = mapped_column(Text(), nullable=True)
    email: Mapped[str | None] = mapped_column(Text(), nullable=True)
    phone: Mapped[str | None] = mapped_column(Text(), nullable=True)
    address: Mapped[str | None] = mapped_column(Text(), nullable=True)
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
