"""SQLAlchemy mappings for documents tables."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
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
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, new_cuid, utc_now_naive
from app.models.enums import DocumentCategory, DocumentStatus


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="documents_pkey"),
        CheckConstraint('LENGTH(BTRIM("title")) > 0', name="documents_title_not_blank"),
        CheckConstraint('"currentVersion" > 0', name="documents_currentVersion_positive"),
        CheckConstraint('"lockVersion" > 0', name="documents_lockVersion_positive"),
        CheckConstraint(
            ' ("status" = \'ARCHIVED\' AND "archivedAt" IS NOT NULL) '
            'OR ("status" <> \'ARCHIVED\' AND "archivedAt" IS NULL) ',
            name="documents_archive_consistent",
        ),
        Index("documents_status_updatedAt_idx", "status", "updatedAt", unique=False),
        Index("documents_category_updatedAt_idx", "category", "updatedAt", unique=False),
        Index("documents_projectId_idx", "projectId", unique=False),
        Index("documents_employeeId_idx", "employeeId", unique=False),
        Index("documents_assetId_idx", "assetId", unique=False),
        Index("documents_createdById_idx", "createdById", unique=False),
        Index("documents_archivedAt_updatedAt_idx", "archivedAt", "updatedAt", unique=False),
    )
    project: Mapped[Any] = relationship("Project", foreign_keys="[Document.projectId]")
    employee: Mapped[Any] = relationship("Employee", foreign_keys="[Document.employeeId]")
    asset: Mapped[Any] = relationship("Asset", foreign_keys="[Document.assetId]")
    createdBy: Mapped[Any] = relationship("User", foreign_keys="[Document.createdById]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    title: Mapped[str] = mapped_column(Text(), nullable=False)
    description: Mapped[str | None] = mapped_column(Text(), nullable=True)
    category: Mapped[DocumentCategory] = mapped_column(
        SAEnum(
            DocumentCategory,
            name="document_category",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        server_default=text("'GENERAL'"),
    )
    status: Mapped[DocumentStatus] = mapped_column(
        SAEnum(
            DocumentStatus,
            name="document_status",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        server_default=text("'DRAFT'"),
    )
    currentVersion: Mapped[int] = mapped_column(Integer(), nullable=False, server_default=text("1"))
    lockVersion: Mapped[int] = mapped_column(Integer(), nullable=False, server_default=text("1"))
    projectId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "projects.id", name="documents_projectId_fkey", ondelete="SET NULL", onupdate="CASCADE"
        ),
        nullable=True,
    )
    employeeId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "employees.id",
            name="documents_employeeId_fkey",
            ondelete="SET NULL",
            onupdate="CASCADE",
        ),
        nullable=True,
    )
    assetId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "assets.id", name="documents_assetId_fkey", ondelete="SET NULL", onupdate="CASCADE"
        ),
        nullable=True,
    )
    createdById: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "users.id", name="documents_createdById_fkey", ondelete="RESTRICT", onupdate="CASCADE"
        ),
        nullable=False,
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


class DocumentVersion(Base):
    __tablename__ = "document_versions"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="document_versions_pkey"),
        CheckConstraint('"versionNumber" > 0', name="document_versions_number_positive"),
        CheckConstraint(
            ' "sizeBytes" > 0 AND "sizeBytes" <= 104857600 ', name="document_versions_size_valid"
        ),
        CheckConstraint(
            ' LENGTH(BTRIM("originalFilename")) > 0 ', name="document_versions_filename_not_blank"
        ),
        CheckConstraint(' LENGTH(BTRIM("mimeType")) > 0 ', name="document_versions_mime_not_blank"),
        CheckConstraint(
            " \"extension\" ~ '^[a-z0-9]{1,10}$' ", name="document_versions_extension_safe"
        ),
        CheckConstraint(" \"sha256\" ~ '^[0-9a-f]{64}$' ", name="document_versions_sha256_valid"),
        CheckConstraint(
            " \"storageKey\" ~ '^[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f-]{36}$' ",
            name="document_versions_storage_key_safe",
        ),
        Index("document_versions_storageKey_key", "storageKey", unique=True),
        Index(
            "document_versions_documentId_versionNumber_key",
            "documentId",
            "versionNumber",
            unique=True,
        ),
        Index(
            "document_versions_documentId_createdAt_idx", "documentId", "createdAt", unique=False
        ),
        Index("document_versions_uploadedById_idx", "uploadedById", unique=False),
    )
    document: Mapped[Any] = relationship("Document", foreign_keys="[DocumentVersion.documentId]")
    uploadedBy: Mapped[Any] = relationship("User", foreign_keys="[DocumentVersion.uploadedById]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    documentId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "documents.id",
            name="document_versions_documentId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    versionNumber: Mapped[int] = mapped_column(Integer(), nullable=False)
    storageKey: Mapped[str] = mapped_column(Text(), nullable=False)
    originalFilename: Mapped[str] = mapped_column(Text(), nullable=False)
    mimeType: Mapped[str] = mapped_column(Text(), nullable=False)
    extension: Mapped[str] = mapped_column(Text(), nullable=False)
    sizeBytes: Mapped[int] = mapped_column(BigInteger(), nullable=False)
    sha256: Mapped[str] = mapped_column(Text(), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text(), nullable=True)
    uploadedById: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "users.id",
            name="document_versions_uploadedById_fkey",
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
