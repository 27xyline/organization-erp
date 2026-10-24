from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from app.api.dependencies import get_actor, get_sessions_service
from app.core.config import Settings
from app.core.context import Actor
from app.domain.errors import DomainError
from app.integrations.session_security import (
    CSRF_COOKIE_NAME,
    CSRF_HEADER_NAME,
    SESSION_COOKIE_NAME,
    create_csrf_token,
    validate_csrf_request,
)
from app.schemas.auth import CredentialsInput
from app.services.sessions import SessionsService

router = APIRouter(prefix="/auth", tags=["auth"])
ActorDependency = Annotated[Actor, Depends(get_actor)]
SessionsDependency = Annotated[SessionsService, Depends(get_sessions_service)]


def csrf_secret(settings: Settings) -> str:
    configured = settings.csrf_secret
    secret = configured.get_secret_value() if configured else ""
    if len(secret.encode()) < 32:
        raise DomainError("AUTH_UNAVAILABLE", "Сервис авторизации недоступен", 503)
    if secret in {
        settings.bridge_secret.get_secret_value() if settings.bridge_secret else "",
        settings.internal_auth_secret.get_secret_value() if settings.internal_auth_secret else "",
    }:
        raise DomainError("AUTH_UNAVAILABLE", "Сервис авторизации недоступен", 503)
    return secret


def require_csrf(request: Request) -> None:
    cookie = request.cookies.get(CSRF_COOKIE_NAME, "")
    header = request.headers.get(CSRF_HEADER_NAME, "")
    secret = csrf_secret(request.app.state.settings)
    if (
        not validate_csrf_request(
            cookie,
            header,
            secret,
            request.headers.get("origin"),
            request.app.state.settings.public_origin,
        )
    ):
        raise DomainError("CSRF_INVALID", "Запрос не прошёл проверку безопасности", 403)


@router.get("/csrf")
async def csrf(request: Request, response: Response) -> dict[str, str]:
    token = create_csrf_token(csrf_secret(request.app.state.settings))
    response.set_cookie(
        CSRF_COOKIE_NAME,
        token,
        httponly=False,
        secure=request.app.state.settings.environment == "production",
        samesite="lax",
        path="/",
    )
    response.headers["cache-control"] = "private, no-store"
    return {"csrfToken": token}


@router.post("/login")
async def login(
    request: Request,
    response: Response,
    input: CredentialsInput,
    sessions: SessionsDependency,
) -> dict[str, object]:
    require_csrf(request)
    result = await sessions.login(input.username, input.password)
    if result is None:
        raise DomainError("UNAUTHENTICATED", "Неверный логин или пароль", 401)
    credentials, token = result
    response.set_cookie(
        SESSION_COOKIE_NAME,
        token,
        httponly=True,
        secure=request.app.state.settings.environment == "production",
        samesite="lax",
        path="/",
        max_age=8 * 60 * 60,
    )
    response.headers["cache-control"] = "private, no-store"
    return {
        "data": {
            "id": credentials.id,
            "name": credentials.name,
            "username": credentials.username,
            "role": credentials.role,
            "roles": credentials.roles,
            "mustChangePassword": credentials.mustChangePassword,
        }
    }


@router.post("/logout")
async def logout(
    request: Request, response: Response, sessions: SessionsDependency
) -> dict[str, bool]:
    require_csrf(request)
    await sessions.logout(request.cookies.get(SESSION_COOKIE_NAME))
    response.delete_cookie(
        SESSION_COOKIE_NAME,
        path="/",
        secure=request.app.state.settings.environment == "production",
        httponly=True,
        samesite="lax",
    )
    response.headers["cache-control"] = "private, no-store"
    return {"success": True}
