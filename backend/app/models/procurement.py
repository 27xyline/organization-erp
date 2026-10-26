"""Отображения SQLAlchemy для таблиц закупок."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
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
from app.models.enums import ProcurementStatus


class ProcurementRequest(Base):
    __tablename__ = "procurement_requests"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="procurement_requests_pkey"),
        CheckConstraint('"budgetLimit" > 0', name="procurement_requests_budget_check"),
        Index("procurement_requests_number_key", "number", unique=True),
        Index("procurement_requests_approvalRequestId_key", "approvalRequestId", unique=True),
        Index("procurement_requests_status_neededBy_idx", "status", "neededBy", unique=False),
        Index("procurement_requests_projectId_status_idx", "projectId", "status", unique=False),
        Index(
            "procurement_requests_requestedById_createdAt_idx",
            "requestedById",
            "createdAt",
            unique=False,
        ),
        Index("procurement_requests_documentId_idx", "documentId", unique=False),
    )
    project: Mapped[Any] = relationship("Project", foreign_keys="[ProcurementRequest.projectId]")
    requestedBy: Mapped[Any] = relationship(
        "User", foreign_keys="[ProcurementRequest.requestedById]"
    )
    approvalRequest: Mapped[Any] = relationship(
        "ApprovalRequest", foreign_keys="[ProcurementRequest.approvalRequestId]"
    )
    document: Mapped[Any] = relationship("Document", foreign_keys="[ProcurementRequest.documentId]")
    items: Mapped[list[Any]] = relationship(
        "ProcurementItem", back_populates="request", cascade="all, delete-orphan"
    )
    contract: Mapped[Any | None] = relationship(
        "ProcurementContract",
        back_populates="request",
        uselist=False,
        cascade="all, delete-orphan",
    )
    deliveries: Mapped[list[Any]] = relationship(
        "ProcurementDelivery", back_populates="request", cascade="all, delete-orphan"
    )

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    number: Mapped[str] = mapped_column(Text(), nullable=False)
    title: Mapped[str] = mapped_column(Text(), nullable=False)
    description: Mapped[str | None] = mapped_column(Text(), nullable=True)
    status: Mapped[ProcurementStatus] = mapped_column(
        SAEnum(
            ProcurementStatus,
            name="procurement_status",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        server_default=text("'DRAFT'"),
    )
    budgetLimit: Mapped[Decimal] = mapped_column(Numeric(precision=12, scale=2), nullable=False)
    neededBy: Mapped[datetime | None] = mapped_column(Date(), nullable=True)
    projectId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "projects.id",
            name="procurement_requests_projectId_fkey",
            ondelete="SET NULL",
            onupdate="CASCADE",
        ),
        nullable=True,
    )
    requestedById: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "users.id",
            name="procurement_requests_requestedById_fkey",
            ondelete="RESTRICT",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    approvalRequestId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "approval_requests.id",
            name="procurement_requests_approvalRequestId_fkey",
            ondelete="SET NULL",
            onupdate="CASCADE",
        ),
        nullable=True,
    )
    documentId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "documents.id",
            name="procurement_requests_documentId_fkey",
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


class ProcurementItem(Base):
    __tablename__ = "procurement_items"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="procurement_items_pkey"),
        CheckConstraint(
            '"quantity" > 0 AND "unitPrice" > 0', name="procurement_items_values_check"
        ),
        Index("procurement_items_requestId_idx", "requestId", unique=False),
        Index("procurement_items_groupId_idx", "groupId", unique=False),
    )
    request: Mapped[Any] = relationship(
        "ProcurementRequest", foreign_keys="[ProcurementItem.requestId]", back_populates="items"
    )
    group: Mapped[Any] = relationship("AssetGroup", foreign_keys="[ProcurementItem.groupId]")
    deliveryItems: Mapped[list[Any]] = relationship(
        "ProcurementDeliveryItem", back_populates="procurementItem"
    )

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    requestId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "procurement_requests.id",
            name="procurement_items_requestId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(Text(), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(precision=10, scale=2), nullable=False)
    unit: Mapped[str] = mapped_column(Text(), nullable=False)
    unitPrice: Mapped[Decimal] = mapped_column(Numeric(precision=12, scale=2), nullable=False)
    groupId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "asset_groups.id",
            name="procurement_items_groupId_fkey",
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


class ProcurementContract(Base):
    __tablename__ = "procurement_contracts"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="procurement_contracts_pkey"),
        CheckConstraint('"amount" > 0', name="procurement_contracts_amount_check"),
        CheckConstraint('"deliveryDueAt" >= "signedAt"', name="procurement_contracts_dates_check"),
        Index("procurement_contracts_requestId_key", "requestId", unique=True),
        Index("procurement_contracts_number_key", "number", unique=True),
        Index("procurement_contracts_supplierId_idx", "supplierId", unique=False),
        Index("procurement_contracts_deliveryDueAt_idx", "deliveryDueAt", unique=False),
        Index("procurement_contracts_documentId_idx", "documentId", unique=False),
    )
    request: Mapped[Any] = relationship(
        "ProcurementRequest",
        foreign_keys="[ProcurementContract.requestId]",
        back_populates="contract",
    )
    supplier: Mapped[Any] = relationship(
        "Supplier", foreign_keys="[ProcurementContract.supplierId]"
    )
    document: Mapped[Any] = relationship(
        "Document", foreign_keys="[ProcurementContract.documentId]"
    )

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    requestId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "procurement_requests.id",
            name="procurement_contracts_requestId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    supplierId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "suppliers.id",
            name="procurement_contracts_supplierId_fkey",
            ondelete="RESTRICT",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    number: Mapped[str] = mapped_column(Text(), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(precision=12, scale=2), nullable=False)
    signedAt: Mapped[datetime] = mapped_column(Date(), nullable=False)
    deliveryDueAt: Mapped[datetime] = mapped_column(Date(), nullable=False)
    documentId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "documents.id",
            name="procurement_contracts_documentId_fkey",
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


class ProcurementDelivery(Base):
    __tablename__ = "procurement_deliveries"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="procurement_deliveries_pkey"),
        Index("procurement_deliveries_contractId_number_key", "contractId", "number", unique=True),
        Index(
            "procurement_deliveries_requestId_receivedAt_idx",
            "requestId",
            "receivedAt",
            unique=False,
        ),
        Index("procurement_deliveries_documentId_idx", "documentId", unique=False),
    )
    request: Mapped[Any] = relationship(
        "ProcurementRequest",
        foreign_keys="[ProcurementDelivery.requestId]",
        back_populates="deliveries",
    )
    contract: Mapped[Any] = relationship(
        "ProcurementContract", foreign_keys="[ProcurementDelivery.contractId]"
    )
    document: Mapped[Any] = relationship(
        "Document", foreign_keys="[ProcurementDelivery.documentId]"
    )
    items: Mapped[list[Any]] = relationship(
        "ProcurementDeliveryItem", back_populates="delivery", cascade="all, delete-orphan"
    )

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    requestId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "procurement_requests.id",
            name="procurement_deliveries_requestId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    contractId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "procurement_contracts.id",
            name="procurement_deliveries_contractId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    number: Mapped[str] = mapped_column(Text(), nullable=False)
    receivedAt: Mapped[datetime] = mapped_column(Date(), nullable=False)
    note: Mapped[str | None] = mapped_column(Text(), nullable=True)
    documentId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "documents.id",
            name="procurement_deliveries_documentId_fkey",
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


class ProcurementDeliveryItem(Base):
    __tablename__ = "procurement_delivery_items"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="procurement_delivery_items_pkey"),
        CheckConstraint('"quantity" > 0', name="procurement_delivery_items_quantity_check"),
        Index("procurement_delivery_items_assetId_key", "assetId", unique=True),
        Index(
            "procurement_delivery_items_deliveryId_procurementItemId_key",
            "deliveryId",
            "procurementItemId",
            unique=True,
        ),
        Index(
            "procurement_delivery_items_procurementItemId_idx", "procurementItemId", unique=False
        ),
    )
    delivery: Mapped[Any] = relationship(
        "ProcurementDelivery",
        foreign_keys="[ProcurementDeliveryItem.deliveryId]",
        back_populates="items",
    )
    procurementItem: Mapped[Any] = relationship(
        "ProcurementItem",
        foreign_keys="[ProcurementDeliveryItem.procurementItemId]",
        back_populates="deliveryItems",
    )
    asset: Mapped[Any] = relationship("Asset", foreign_keys="[ProcurementDeliveryItem.assetId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    deliveryId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "procurement_deliveries.id",
            name="procurement_delivery_items_deliveryId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    procurementItemId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "procurement_items.id",
            name="procurement_delivery_items_procurementItemId_fkey",
            ondelete="RESTRICT",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(precision=10, scale=2), nullable=False)
    assetId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "assets.id",
            name="procurement_delivery_items_assetId_fkey",
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
