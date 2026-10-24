from __future__ import annotations

import secrets
import string
import threading
import time
from datetime import UTC, datetime

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base for ORM mappings of the Alembic-owned PostgreSQL schema."""


_CUID_ALPHABET = string.ascii_lowercase + string.digits
_CUID_LOCK = threading.Lock()
_CUID_COUNTER = secrets.randbelow(36**4)
_CUID_FINGERPRINT = "".join(secrets.choice(_CUID_ALPHABET) for _ in range(4))


def _base36(value: int, width: int) -> str:
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    encoded = "0" if value == 0 else ""
    while value:
        value, remainder = divmod(value, 36)
        encoded = alphabet[remainder] + encoded
    return encoded[-width:].rjust(width, "0")


def new_cuid() -> str:
    """Return a 25-character lowercase CUID-shaped ID accepted by Zod `.cuid()`.

    This preserves the legacy string format and provides collision resistance, but does not
    claim byte-for-byte Prisma generator compatibility or ordering.
    """
    global _CUID_COUNTER
    with _CUID_LOCK:
        _CUID_COUNTER = (_CUID_COUNTER + 1) % (36**4)
        counter = _CUID_COUNTER
    timestamp = _base36(int(time.time() * 1000), 8)
    random_suffix = "".join(secrets.choice(_CUID_ALPHABET) for _ in range(8))
    return f"c{timestamp}{_base36(counter, 4)}{_CUID_FINGERPRINT}{random_suffix}"


def utc_now_naive() -> datetime:
    """Return UTC without tzinfo, rounded to milliseconds for TIMESTAMP(3)."""
    now = datetime.now(UTC).replace(tzinfo=None)
    return now.replace(microsecond=(now.microsecond // 1000) * 1000)
