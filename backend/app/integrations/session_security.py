from __future__ import annotations

import hashlib
import hmac
import secrets
from urllib.parse import urlsplit

SESSION_COOKIE_NAME = "erp_session"
CSRF_COOKIE_NAME = "erp_csrf"
CSRF_HEADER_NAME = "x-csrf-token"


def new_session_token() -> str:
    """Return an opaque URL-safe token with 256 bits of entropy."""
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class SessionTokenManager:
    """Adapter for generating opaque tokens and storing only their SHA-256 hashes."""

    def new_token(self) -> str:
        return new_session_token()

    def hash_token(self, token: str) -> str:
        return hash_session_token(token)


def create_csrf_token(secret: str) -> str:
    nonce = secrets.token_urlsafe(32)
    signature = hmac.new(secret.encode(), nonce.encode(), hashlib.sha256).hexdigest()
    return f"{nonce}.{signature}"


def verify_csrf_token(token: str, secret: str) -> bool:
    try:
        nonce, signature = token.rsplit(".", 1)
    except ValueError:
        return False
    if not nonce or len(signature) != 64 or not signature.isascii():
        return False
    expected = hmac.new(secret.encode(), nonce.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature.encode("ascii"), expected.encode("ascii"))


def validate_csrf_request(
    cookie: str,
    header: str,
    secret: str,
    origin: str | None,
    public_origin: str | None,
) -> bool:
    if not cookie or not header or not hmac.compare_digest(cookie.encode(), header.encode()):
        return False
    if not verify_csrf_token(cookie, secret):
        return False
    if origin is None:
        return True
    if not public_origin:
        return False
    try:
        actual = urlsplit(origin)
        expected = urlsplit(public_origin)
        if actual.scheme not in {"http", "https"} or expected.scheme not in {"http", "https"}:
            return False
        actual_port = actual.port or (443 if actual.scheme == "https" else 80)
        expected_port = expected.port or (443 if expected.scheme == "https" else 80)
        return (
            actual.scheme.lower() == expected.scheme.lower()
            and actual.hostname is not None
            and actual.hostname.lower() == (expected.hostname or "").lower()
            and actual_port == expected_port
            and not actual.username
            and not actual.password
            and actual.path in {"", "/"}
            and not actual.query
            and not actual.fragment
            and expected.path in {"", "/"}
            and not expected.username
            and not expected.password
            and not expected.query
            and not expected.fragment
        )
    except ValueError:
        return False
