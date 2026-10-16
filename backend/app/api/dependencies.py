from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from dataclasses import replace
from typing import Annotated, cast

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import Actor, RequestContext
from app.domain.errors import DomainError
from app.integrations.asset_import import OpenpyxlAssetWorkbook
from app.integrations.asset_qr import render_asset_qr
from app.integrations.auth_bridge import verify_bridge
from app.integrations.password_hash import Argon2PasswordHasher
from app.services.asset_export import AssetExportService
from app.services.asset_import import AssetImportService
from app.services.auth import AuthService
from app.services.catalogs import CatalogService
from app.services.departments import DepartmentService
from app.services.employees import EmployeeService
from app.services.personnel_actions import PersonnelActionService
from app.services.users import UserService
from app.services.workforce import WorkforceService


def get_auth_service(request: Request) -> AuthService:
    return AuthService(request.app.state.unit_of_work_factory, Argon2PasswordHasher())


def get_user_service(request: Request) -> UserService:
    return UserService(request.app.state.unit_of_work_factory, Argon2PasswordHasher())


def get_department_service(request: Request) -> DepartmentService:
    return DepartmentService(request.app.state.unit_of_work_factory)


def get_catalog_service(request: Request) -> CatalogService:
    return CatalogService(request.app.state.unit_of_work_factory)


async def get_actor(
    request: Request, service: Annotated[AuthService, Depends(get_auth_service)]
) -> Actor:
    configured = request.app.state.settings.bridge_secret
    secret = configured.get_secret_value() if configured else ""
    if len(secret.encode()) < 32:
        raise DomainError("AUTH_UNAVAILABLE", "Сервис авторизации недоступен", 503)
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)
    identifier, version = verify_bridge(header[7:], secret)
    return await service.resolve_actor(identifier, version)


async def get_authenticated_context(
    request: Request, actor: Annotated[Actor, Depends(get_actor)]
) -> RequestContext:
    if actor.must_change_password and request.url.path != "/api/account/password":
        raise DomainError("PASSWORD_CHANGE_REQUIRED", "Необходимо изменить временный пароль", 403)
    return replace(cast(RequestContext, request.state.request_context), actor=actor)


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.session_factory() as session:
        yield session


def get_employee_service(request: Request) -> EmployeeService:
    return EmployeeService(request.app.state.unit_of_work_factory)


def get_workforce_service(request: Request) -> WorkforceService:
    return WorkforceService(request.app.state.unit_of_work_factory)


def get_personnel_action_service(request: Request) -> PersonnelActionService:
    return PersonnelActionService(request.app.state.unit_of_work_factory)


def get_asset_import_service(request: Request) -> AssetImportService:
    return AssetImportService(request.app.state.unit_of_work_factory, OpenpyxlAssetWorkbook())


def get_asset_export_service(request: Request) -> AssetExportService:
    return AssetExportService(request.app.state.unit_of_work_factory, OpenpyxlAssetWorkbook())


def get_asset_qr_renderer() -> Callable[[str], bytes]:
    return render_asset_qr
