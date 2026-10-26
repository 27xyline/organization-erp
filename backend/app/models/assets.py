"""Отображения SQLAlchemy для таблиц имущества."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    PrimaryKeyConstraint,
    Sequence,
    Text,
    text,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import ARRAY, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, new_cuid, utc_now_naive
from app.models.enums import (
    AssetInventoryStatus,
    AssetMaintenanceStatus,
    AssetMaintenanceType,
    AssetStatus,
    OperationType,
)


class Asset(Base):
    __tablename__ = "assets"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="assets_pkey"),
        CheckConstraint('"quantity" >= 0', name="assets_quantity_nonnegative"),
        CheckConstraint('"unitPrice" >= 0', name="assets_unitPrice_nonnegative"),
        CheckConstraint('"totalCost" >= 0', name="assets_totalCost_nonnegative"),
        Index("assets_inventoryNumber_key", "inventoryNumber", unique=True),
        Index("assets_molId_idx", "molId", unique=False),
        Index("assets_groupId_idx", "groupId", unique=False),
        Index("assets_status_idx", "status", unique=False),
        Index("assets_isArchived_status_idx", "isArchived", "status", unique=False),
        Index("assets_projectId_idx", "projectId", unique=False),
    )
    mol: Mapped[Any] = relationship("Mol", foreign_keys="[Asset.molId]")
    group: Mapped[Any] = relationship("AssetGroup", foreign_keys="[Asset.groupId]")
    project: Mapped[Any] = relationship("Project", foreign_keys="[Asset.projectId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    orderNumber: Mapped[int] = mapped_column(
        Integer(),
        nullable=False,
        default=Sequence("assets_orderNumber_seq"),
    )
    name: Mapped[str] = mapped_column(Text(), nullable=False)
    inventoryNumber: Mapped[str] = mapped_column(Text(), nullable=False)
    unitPrice: Mapped[Decimal] = mapped_column(Numeric(precision=10, scale=2), nullable=False)
    unitOfMeasure: Mapped[str] = mapped_column(Text(), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(precision=10, scale=2), nullable=False)
    totalCost: Mapped[Decimal] = mapped_column(Numeric(precision=12, scale=2), nullable=False)
    initialCost: Mapped[Decimal] = mapped_column(
        Numeric(precision=12, scale=2), nullable=False, server_default=text("0")
    )
    usefulLifeMonths: Mapped[int] = mapped_column(
        Integer(), nullable=False, server_default=text("60")
    )
    molId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey("mols.id", name="assets_molId_fkey", ondelete="RESTRICT", onupdate="CASCADE"),
        nullable=False,
    )
    groupId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "asset_groups.id", name="assets_groupId_fkey", ondelete="RESTRICT", onupdate="CASCADE"
        ),
        nullable=False,
    )
    projectId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "projects.id", name="assets_projectId_fkey", ondelete="SET NULL", onupdate="CASCADE"
        ),
        nullable=True,
    )
    contractCode: Mapped[str | None] = mapped_column(Text(), nullable=True)
    internalFundingCode: Mapped[str | None] = mapped_column(Text(), nullable=True)
    isExistingAsset: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, server_default=text("false")
    )
    recordingDate: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=False
    )
    documentType: Mapped[str] = mapped_column(Text(), nullable=False)
    documentDetails: Mapped[str] = mapped_column(Text(), nullable=False)
    documentFiles: Mapped[list[str] | None] = mapped_column(
        ARRAY(Text()).evaluates_none(),
        nullable=True,
        server_default=text("ARRAY[]::TEXT[]"),
    )
    status: Mapped[AssetStatus] = mapped_column(
        SAEnum(
            AssetStatus,
            name="asset_status",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        server_default=text("'IN_STOCK'"),
    )
    isArchived: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, server_default=text("false")
    )
    plannedDisposalDate: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    plannedDisposalReason: Mapped[str | None] = mapped_column(Text(), nullable=True)
    photos: Mapped[list[str] | None] = mapped_column(
        ARRAY(Text()).evaluates_none(),
        nullable=True,
        server_default=text("ARRAY[]::TEXT[]"),
    )
    notes: Mapped[str | None] = mapped_column(Text(), nullable=True)
    accountingForm: Mapped[str] = mapped_column(
        Text(), nullable=False, server_default=text("'145'")
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


class AssetMaintenance(Base):
    __tablename__ = "asset_maintenance"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="asset_maintenance_pkey"),
        CheckConstraint('"cost" >= 0', name="asset_maintenance_cost_check"),
        Index(
            "asset_maintenance_assetId_scheduledDate_idx", "assetId", "scheduledDate", unique=False
        ),
        Index(
            "asset_maintenance_status_scheduledDate_idx", "status", "scheduledDate", unique=False
        ),
        Index("asset_maintenance_nextDueDate_idx", "nextDueDate", unique=False),
    )
    asset: Mapped[Any] = relationship("Asset", foreign_keys="[AssetMaintenance.assetId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    assetId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "assets.id",
            name="asset_maintenance_assetId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    type: Mapped[AssetMaintenanceType] = mapped_column(
        SAEnum(
            AssetMaintenanceType,
            name="asset_maintenance_type",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    status: Mapped[AssetMaintenanceStatus] = mapped_column(
        SAEnum(
            AssetMaintenanceStatus,
            name="asset_maintenance_status",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        server_default=text("'PLANNED'"),
    )
    title: Mapped[str] = mapped_column(Text(), nullable=False)
    description: Mapped[str | None] = mapped_column(Text(), nullable=True)
    scheduledDate: Mapped[datetime] = mapped_column(Date(), nullable=False)
    startedAt: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    completedAt: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    nextDueDate: Mapped[datetime | None] = mapped_column(Date(), nullable=True)
    provider: Mapped[str | None] = mapped_column(Text(), nullable=True)
    cost: Mapped[Decimal] = mapped_column(
        Numeric(precision=12, scale=2), nullable=False, server_default=text("0")
    )
    result: Mapped[str | None] = mapped_column(Text(), nullable=True)
    assetStatusBefore: Mapped[AssetStatus | None] = mapped_column(
        SAEnum(
            AssetStatus,
            name="asset_status",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
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


class Operation(Base):
    __tablename__ = "operations"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="operations_pkey"),
        CheckConstraint(
            ' ("type" = \'STATUS_CHANGE\' AND "quantity" >= 0) '
            'OR ("type" <> \'STATUS_CHANGE\' AND "quantity" > 0) ',
            name="operations_quantity_valid",
        ),
        CheckConstraint('"unitPrice" >= 0', name="operations_unitPrice_nonnegative"),
        CheckConstraint('"totalCost" >= 0', name="operations_totalCost_nonnegative"),
        Index("operations_assetId_date_idx", "assetId", "date", unique=False),
        Index("operations_type_date_idx", "type", "date", unique=False),
    )
    asset: Mapped[Any] = relationship("Asset", foreign_keys="[Operation.assetId]")
    fromMol: Mapped[Any] = relationship("Mol", foreign_keys="[Operation.fromMolId]")
    toMol: Mapped[Any] = relationship("Mol", foreign_keys="[Operation.toMolId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    type: Mapped[OperationType] = mapped_column(
        SAEnum(
            OperationType,
            name="operation_type",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    assetId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "assets.id", name="operations_assetId_fkey", ondelete="RESTRICT", onupdate="CASCADE"
        ),
        nullable=False,
    )
    fromMolId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "mols.id", name="operations_fromMolId_fkey", ondelete="SET NULL", onupdate="CASCADE"
        ),
        nullable=True,
    )
    toMolId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "mols.id", name="operations_toMolId_fkey", ondelete="SET NULL", onupdate="CASCADE"
        ),
        nullable=True,
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(precision=10, scale=2), nullable=False)
    unitPrice: Mapped[Decimal] = mapped_column(Numeric(precision=10, scale=2), nullable=False)
    totalCost: Mapped[Decimal] = mapped_column(Numeric(precision=12, scale=2), nullable=False)
    date: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=False, precision=3), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text(), nullable=True)
    documentType: Mapped[str] = mapped_column(Text(), nullable=False)
    documentDetails: Mapped[str] = mapped_column(Text(), nullable=False)
    documentFiles: Mapped[list[str] | None] = mapped_column(
        ARRAY(Text()).evaluates_none(),
        nullable=True,
        server_default=text("ARRAY[]::TEXT[]"),
    )
    oldStatus: Mapped[AssetStatus | None] = mapped_column(
        SAEnum(
            AssetStatus,
            name="asset_status",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=True,
    )
    newStatus: Mapped[AssetStatus | None] = mapped_column(
        SAEnum(
            AssetStatus,
            name="asset_status",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=True,
    )
    createdAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )


class AssetHolding(Base):
    __tablename__ = "asset_holdings"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="asset_holdings_pkey"),
        CheckConstraint('"quantity" >= 0', name="asset_holdings_quantity_nonnegative"),
        Index("asset_holdings_assetId_molId_key", "assetId", "molId", unique=True),
        Index("asset_holdings_molId_assetId_idx", "molId", "assetId", unique=False),
    )
    asset: Mapped[Any] = relationship("Asset", foreign_keys="[AssetHolding.assetId]")
    mol: Mapped[Any] = relationship("Mol", foreign_keys="[AssetHolding.molId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    assetId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "assets.id", name="asset_holdings_assetId_fkey", ondelete="CASCADE", onupdate="CASCADE"
        ),
        nullable=False,
    )
    molId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "mols.id", name="asset_holdings_molId_fkey", ondelete="RESTRICT", onupdate="CASCADE"
        ),
        nullable=False,
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(precision=10, scale=2), nullable=False)
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


class AssetInventory(Base):
    __tablename__ = "asset_inventories"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="asset_inventories_pkey"),
        Index(
            "asset_inventories_molId_status_createdAt_idx",
            "molId",
            "status",
            "createdAt",
            unique=False,
        ),
    )
    mol: Mapped[Any] = relationship("Mol", foreign_keys="[AssetInventory.molId]")
    createdBy: Mapped[Any] = relationship("User", foreign_keys="[AssetInventory.createdById]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    name: Mapped[str] = mapped_column(Text(), nullable=False)
    status: Mapped[AssetInventoryStatus] = mapped_column(
        SAEnum(
            AssetInventoryStatus,
            name="asset_inventory_status",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        server_default=text("'IN_PROGRESS'"),
    )
    molId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "mols.id", name="asset_inventories_molId_fkey", ondelete="RESTRICT", onupdate="CASCADE"
        ),
        nullable=False,
    )
    createdById: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "users.id",
            name="asset_inventories_createdById_fkey",
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
    completedAt: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )


class AssetInventoryEntry(Base):
    __tablename__ = "asset_inventory_entries"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="asset_inventory_entries_pkey"),
        Index(
            "asset_inventory_entries_inventoryId_inventoryNumber_key",
            "inventoryId",
            "inventoryNumber",
            unique=True,
        ),
        Index(
            "asset_inventory_entries_inventoryId_scannedAt_idx",
            "inventoryId",
            "scannedAt",
            unique=False,
        ),
    )
    inventory: Mapped[Any] = relationship(
        "AssetInventory", foreign_keys="[AssetInventoryEntry.inventoryId]"
    )
    asset: Mapped[Any] = relationship("Asset", foreign_keys="[AssetInventoryEntry.assetId]")
    scannedBy: Mapped[Any] = relationship("User", foreign_keys="[AssetInventoryEntry.scannedById]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    inventoryId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "asset_inventories.id",
            name="asset_inventory_entries_inventoryId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    assetId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "assets.id",
            name="asset_inventory_entries_assetId_fkey",
            ondelete="SET NULL",
            onupdate="CASCADE",
        ),
        nullable=True,
    )
    inventoryNumber: Mapped[str] = mapped_column(Text(), nullable=False)
    assetName: Mapped[str] = mapped_column(Text(), nullable=False)
    unitOfMeasure: Mapped[str] = mapped_column(Text(), nullable=False)
    expectedQuantity: Mapped[Decimal] = mapped_column(
        Numeric(precision=10, scale=2), nullable=False
    )
    foundQuantity: Mapped[Decimal | None] = mapped_column(
        Numeric(precision=10, scale=2), nullable=True
    )
    note: Mapped[str | None] = mapped_column(Text(), nullable=True)
    scannedById: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "users.id",
            name="asset_inventory_entries_scannedById_fkey",
            ondelete="SET NULL",
            onupdate="CASCADE",
        ),
        nullable=True,
    )
    scannedAt: Mapped[datetime | None] = mapped_column(
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
