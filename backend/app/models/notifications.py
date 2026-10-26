"""Отображения SQLAlchemy для таблиц уведомлений."""

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
from app.models.enums import NotificationChannel, NotificationEventType, NotificationOutboxStatus


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="notifications_pkey"),
        CheckConstraint('length(btrim("title")) > 0', name="notifications_title_not_blank"),
        CheckConstraint(
            'length(btrim("dedupeKey")) > 0', name="notifications_dedupe_key_not_blank"
        ),
        CheckConstraint(
            '"readAt" IS NULL OR "channel" = \'IN_APP\'', name="notifications_read_at_in_app_only"
        ),
        Index(
            "notifications_userId_dedupeKey_channel_key",
            "userId",
            "dedupeKey",
            "channel",
            unique=True,
        ),
        Index(
            "notifications_userId_channel_deletedAt_readAt_createdAt_idx",
            "userId",
            "channel",
            "deletedAt",
            "readAt",
            "createdAt",
            unique=False,
        ),
        Index("notifications_eventType_createdAt_idx", "eventType", "createdAt", unique=False),
    )
    user: Mapped[Any] = relationship("User", foreign_keys="[Notification.userId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    userId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "users.id", name="notifications_userId_fkey", ondelete="CASCADE", onupdate="CASCADE"
        ),
        nullable=False,
    )
    eventType: Mapped[NotificationEventType] = mapped_column(
        SAEnum(
            NotificationEventType,
            name="notification_event_type",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    channel: Mapped[NotificationChannel] = mapped_column(
        SAEnum(
            NotificationChannel,
            name="notification_channel",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(Text(), nullable=False)
    body: Mapped[str] = mapped_column(Text(), nullable=False)
    targetUrl: Mapped[str | None] = mapped_column(Text(), nullable=True)
    entityType: Mapped[str | None] = mapped_column(Text(), nullable=True)
    entityId: Mapped[str | None] = mapped_column(Text(), nullable=True)
    dedupeKey: Mapped[str] = mapped_column(Text(), nullable=False)
    readAt: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    deletedAt: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    createdAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="notification_preferences_pkey"),
        Index(
            "notification_preferences_userId_eventType_channel_key",
            "userId",
            "eventType",
            "channel",
            unique=True,
        ),
        Index("notification_preferences_userId_channel_idx", "userId", "channel", unique=False),
    )
    user: Mapped[Any] = relationship("User", foreign_keys="[NotificationPreference.userId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    userId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "users.id",
            name="notification_preferences_userId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    eventType: Mapped[NotificationEventType] = mapped_column(
        SAEnum(
            NotificationEventType,
            name="notification_event_type",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    channel: Mapped[NotificationChannel] = mapped_column(
        SAEnum(
            NotificationChannel,
            name="notification_channel",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    enabled: Mapped[bool] = mapped_column(Boolean(), nullable=False, server_default=text("true"))
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


class NotificationOutbox(Base):
    __tablename__ = "notification_outbox"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="notification_outbox_pkey"),
        CheckConstraint('"attempts" >= 0', name="notification_outbox_attempts_nonnegative"),
        Index("notification_outbox_notificationId_key", "notificationId", unique=True),
        Index(
            "notification_outbox_status_availableAt_createdAt_idx",
            "status",
            "availableAt",
            "createdAt",
            unique=False,
        ),
        Index("notification_outbox_userId_createdAt_idx", "userId", "createdAt", unique=False),
        Index(
            "notification_outbox_status_leaseExpiresAt_idx",
            "status",
            "leaseExpiresAt",
            unique=False,
        ),
    )
    notification: Mapped[Any] = relationship(
        "Notification", foreign_keys="[NotificationOutbox.notificationId]"
    )
    user: Mapped[Any] = relationship("User", foreign_keys="[NotificationOutbox.userId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    notificationId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "notifications.id",
            name="notification_outbox_notificationId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    userId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "users.id",
            name="notification_outbox_userId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    status: Mapped[NotificationOutboxStatus] = mapped_column(
        SAEnum(
            NotificationOutboxStatus,
            name="notification_outbox_status",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        server_default=text("'PENDING'"),
    )
    payload: Mapped[Any] = mapped_column(JSONB(), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer(), nullable=False, server_default=text("0"))
    availableAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    claimToken: Mapped[str | None] = mapped_column(Text(), nullable=True)
    leaseExpiresAt: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    processedAt: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    lastError: Mapped[str | None] = mapped_column(Text(), nullable=True)
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


class ScheduledAlertRun(Base):
    __tablename__ = "scheduled_alert_runs"
    __table_args__ = (PrimaryKeyConstraint("key", name="scheduled_alert_runs_pkey"),)
    key: Mapped[str] = mapped_column(Text(), nullable=False)
    lastStartedAt: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    lastSucceededAt: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    lastError: Mapped[str | None] = mapped_column(Text(), nullable=True)
    updatedAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        default=utc_now_naive,
        onupdate=utc_now_naive,
    )


class SmtpSettings(Base):
    __tablename__ = "smtp_settings"
    __table_args__ = (PrimaryKeyConstraint("id", name="smtp_settings_pkey"),)
    id: Mapped[str] = mapped_column(Text(), nullable=False, server_default=text("'singleton'"))
    host: Mapped[str] = mapped_column(Text(), nullable=False)
    port: Mapped[int] = mapped_column(Integer(), nullable=False)
    username: Mapped[str] = mapped_column(Text(), nullable=False)
    password: Mapped[str] = mapped_column(Text(), nullable=False)
    secure: Mapped[bool] = mapped_column(Boolean(), nullable=False, server_default=text("false"))
    fromEmail: Mapped[str] = mapped_column(Text(), nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        default=utc_now_naive,
        onupdate=utc_now_naive,
    )
