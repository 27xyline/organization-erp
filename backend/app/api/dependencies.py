from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from dataclasses import replace
from typing import Annotated, cast

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import Actor, RequestContext
from app.core.metrics import DatabaseMetricInstruments, acquire_session_connection
from app.domain.errors import DomainError
from app.integrations.asset_import import OpenpyxlAssetWorkbook
from app.integrations.asset_qr import render_asset_qr
from app.integrations.audit import SqlAlchemyAuditGateway
from app.integrations.auth_bridge import verify_bridge
from app.integrations.exports import DashboardExportRenderer
from app.integrations.my_actions import SqlAlchemyMyActionsGateway
from app.integrations.password_hash import Argon2PasswordHasher
from app.integrations.payroll_export import OpenpyxlPayrollWorkbook
from app.integrations.reporting import SqlAlchemyReportingGateway
from app.integrations.search import SqlAlchemySearchGateway
from app.integrations.session_security import SESSION_COOKIE_NAME, SessionTokenManager
from app.services.asset_export import AssetExportService
from app.services.asset_import import AssetImportService
from app.services.auth import AuthService
from app.services.catalogs import CatalogService
from app.services.dashboard import DashboardService
from app.services.departments import DepartmentService
from app.services.employees import EmployeeService
from app.services.exports import ExportService
from app.services.finance_periods import PayrollPeriodService
from app.services.my_actions import MyActionsService
from app.services.payroll import PayrollService
from app.services.personnel_actions import PersonnelActionService
from app.services.reporting import ReportingService
from app.services.search import SearchService
from app.services.sessions import SessionsService
from app.services.users import UserService
from app.services.workforce import WorkforceService


def get_auth_service(request: Request) -> AuthService:
    return AuthService(request.app.state.unit_of_work_factory, Argon2PasswordHasher())


def get_sessions_service(
    request: Request, auth: Annotated[AuthService, Depends(get_auth_service)]
) -> SessionsService:
    return SessionsService(request.app.state.unit_of_work_factory, auth, SessionTokenManager())


def get_user_service(request: Request) -> UserService:
    return UserService(request.app.state.unit_of_work_factory, Argon2PasswordHasher())


def get_department_service(request: Request) -> DepartmentService:
    return DepartmentService(request.app.state.unit_of_work_factory)


def get_catalog_service(request: Request) -> CatalogService:
    return CatalogService(request.app.state.unit_of_work_factory)


async def get_actor(
    request: Request,
    service: Annotated[AuthService, Depends(get_auth_service)],
    sessions: Annotated[SessionsService, Depends(get_sessions_service)],
) -> Actor:
    session_token = request.cookies.get(SESSION_COOKIE_NAME)
    if session_token:
        return await sessions.resolve(session_token)
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
        instruments = getattr(request.app.state, "database_metric_instruments", None)
        if isinstance(instruments, DatabaseMetricInstruments):
            await acquire_session_connection(session, instruments)
        yield session


def get_employee_service(request: Request) -> EmployeeService:
    return EmployeeService(request.app.state.unit_of_work_factory)


def get_payroll_period_service(request: Request) -> PayrollPeriodService:
    return PayrollPeriodService(request.app.state.unit_of_work_factory)


def get_payroll_service(request: Request) -> PayrollService:
    return PayrollService(request.app.state.unit_of_work_factory, OpenpyxlPayrollWorkbook())


def get_workforce_service(request: Request) -> WorkforceService:
    return WorkforceService(request.app.state.unit_of_work_factory)


def get_personnel_action_service(request: Request) -> PersonnelActionService:
    return PersonnelActionService(request.app.state.unit_of_work_factory)


def get_asset_import_service(request: Request) -> AssetImportService:
    return AssetImportService(request.app.state.unit_of_work_factory, OpenpyxlAssetWorkbook())


def get_asset_export_service(request: Request) -> AssetExportService:
    return AssetExportService(request.app.state.unit_of_work_factory, OpenpyxlAssetWorkbook())


def get_dashboard_service(request: Request) -> DashboardService:
    return DashboardService(SqlAlchemyReportingGateway(request.app.state.session_factory))


def get_reporting_service(request: Request) -> ReportingService:
    return ReportingService(SqlAlchemyReportingGateway(request.app.state.session_factory))


def get_search_service(request: Request) -> SearchService:
    return SearchService(SqlAlchemySearchGateway(request.app.state.session_factory))


def get_my_actions_service(request: Request) -> MyActionsService:
    return MyActionsService(SqlAlchemyMyActionsGateway(request.app.state.session_factory))


def get_export_service(request: Request) -> ExportService:
    return ExportService(
        DashboardExportRenderer(), SqlAlchemyAuditGateway(request.app.state.session_factory)
    )


def get_asset_qr_renderer() -> Callable[[str], bytes]:
    return render_asset_qr
