"""Verify the temporary server-to-server identity proof; roles never come from JWT."""

import jwt

from app.domain.errors import DomainError


def verify_bridge(token: str, secret: str) -> tuple[str, int]:
    if len(secret.encode()) < 32:
        raise DomainError("AUTH_UNAVAILABLE", "Сервис авторизации недоступен", 503)
    try:
        claims = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            issuer="erp-next",
            audience="erp-python",
            options={"require": ["sub", "sessionVersion", "iss", "aud", "iat", "exp"]},
        )
        sub, version, issued, expiry = (
            claims["sub"],
            claims["sessionVersion"],
            claims["iat"],
            claims["exp"],
        )
        if (
            not isinstance(sub, str)
            or not sub
            or type(version) is not int
            or not 1 <= version <= 9007199254740991
        ):
            raise ValueError("Invalid identity")
        if type(issued) is not int or type(expiry) is not int or not 0 < expiry - issued <= 60:
            raise ValueError("Invalid lifetime")
        if claims["iss"] != "erp-next" or claims["aud"] != "erp-python":
            raise ValueError("Invalid issuer or audience")
        return sub, version
    except (jwt.InvalidTokenError, ValueError, KeyError, TypeError) as exc:
        raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401) from exc
