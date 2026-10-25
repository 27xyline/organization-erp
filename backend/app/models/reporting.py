"""Отображения SQLAlchemy для таблиц отчётности."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    ForeignKey,
    Index,
    PrimaryKeyConstraint,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, new_cuid, utc_now_naive


class ReportPreset(Base):
    __tablename__ = "report_presets"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="report_presets_pkey"),
        Index("report_presets_createdById_idx", "createdById", unique=False),
    )
    createdBy: Mapped[Any] = relationship("User", foreign_keys="[ReportPreset.createdById]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    name: Mapped[str] = mapped_column(Text(), nullable=False)
    metrics: Mapped[list[str] | None] = mapped_column(ARRAY(Text()).evaluates_none(), nullable=True)
    groupBy: Mapped[str | None] = mapped_column(Text(), nullable=True)
    filters: Mapped[Any | None] = mapped_column(JSONB(none_as_null=True), nullable=True)
    createdById: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "users.id",
            name="report_presets_createdById_fkey",
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


class AssetSavedView(Base):
    __tablename__ = "asset_saved_views"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="asset_saved_views_pkey"),
        Index("asset_saved_views_userId_name_key", "userId", "name", unique=True),
        Index("asset_saved_views_userId_updatedAt_idx", "userId", "updatedAt", unique=False),
    )
    user: Mapped[Any] = relationship("User", foreign_keys="[AssetSavedView.userId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    userId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "users.id", name="asset_saved_views_userId_fkey", ondelete="CASCADE", onupdate="CASCADE"
        ),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(Text(), nullable=False)
    filters: Mapped[Any] = mapped_column(JSONB(), nullable=False)
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
