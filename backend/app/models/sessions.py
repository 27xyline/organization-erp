from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, PrimaryKeyConstraint, Text, text
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, new_cuid, utc_now_naive


class UserSession(Base):
    __tablename__ = "user_sessions"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="user_sessions_pkey"),
        Index("user_sessions_tokenHash_key", "tokenHash", unique=True),
        Index("user_sessions_userId_expiresAt_idx", "userId", "expiresAt"),
    )
    user: Mapped[Any] = relationship("User", foreign_keys="[UserSession.userId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    userId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey("users.id", name="user_sessions_userId_fkey", ondelete="CASCADE"),
        nullable=False,
    )
    tokenHash: Mapped[str] = mapped_column(Text(), nullable=False)
    sessionVersion: Mapped[int] = mapped_column(nullable=False)
    expiresAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=False
    )
    revokedAt: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    createdAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=False, default=utc_now_naive,
        server_default=text("CURRENT_TIMESTAMP"),
    )
