from __future__ import annotations

from contextvars import ContextVar, Token
from dataclasses import dataclass

from app.domain.auth.rules import AccessContext


@dataclass(frozen=True, slots=True)
class Actor:
    actor_id: str
    roles: tuple[str, ...] = ()
    is_authenticated: bool = False
    employee_id: str | None = None
    session_version: int = 0
    permissions: tuple[str, ...] = ()
    must_change_password: bool = False
    username: str = ""
    name: str = ""
    role: str = ""
    access: AccessContext | None = None


@dataclass(frozen=True, slots=True)
class RequestContext:
    request_id: str
    traceparent: str | None = None
    actor: Actor | None = None


_current_request_context: ContextVar[RequestContext | None] = ContextVar(
    "current_request_context", default=None
)


def set_request_context(context: RequestContext) -> Token[RequestContext | None]:
    return _current_request_context.set(context)


def reset_request_context(token: Token[RequestContext | None]) -> None:
    _current_request_context.reset(token)


def current_request_context() -> RequestContext | None:
    return _current_request_context.get()
