"""Scope checks use the same complete grant as the legacy document module."""

from app.core.context import Actor
from app.domain.auth.rules import AccessContext
from app.domain.errors import DomainError


def access_for(
    actor: Actor, permission: str, target: dict[str, object] | None = None
) -> AccessContext:
    access = actor.access
    if access is None or not (
        access.has(permission) if target is None else access.allows(permission, target)
    ):
        raise DomainError("FORBIDDEN", "Недостаточно прав", 403)
    return access
