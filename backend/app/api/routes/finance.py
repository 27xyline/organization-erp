from __future__ import annotations

import re
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.api.dependencies import get_authenticated_context
from app.core.context import RequestContext
from app.domain.errors import DomainError
from app.schemas.finance_workflows import (
    FinancePlanDeleteInput,
    FinancePlanSaveInput,
    ProjectPayrollDeleteInput,
    ProjectPayrollSaveInput,
)
from app.services.finance import FinanceService

finance_router = APIRouter(prefix="/finance", tags=["finance"])
project_payroll_router = APIRouter(prefix="/projects", tags=["project-payroll"])
Context = Annotated[RequestContext, Depends(get_authenticated_context)]


def get_finance_service(request: Request) -> FinanceService:
    return FinanceService(request.app.state.unit_of_work_factory)


Service = Annotated[FinanceService, Depends(get_finance_service)]


def _legacy_int(value: str | None, default: int) -> int | None:
    if value is None:
        return default
    match = re.match(r"^\s*([+-]?\d+)", value)
    return int(match.group(1)) if match else None


def _error(error: DomainError) -> JSONResponse:
    return JSONResponse({"error": error.message}, status_code=error.status_code)


@finance_router.get("/plans")
async def get_plan_table(request: Request, context: Context, service: Service) -> Any:
    plan_type = request.query_params.get("type")
    year = _legacy_int(request.query_params.get("year"), date.today().year)
    if plan_type not in {"oklad", "nadbavka"}:
        return JSONResponse({"error": "Invalid finance plan type"}, status_code=400)
    if year is None or year < 2000 or year > 2100:
        return JSONResponse({"error": "Invalid finance year"}, status_code=400)
    try:
        return await service.get_plan_table(plan_type, year, context)
    except DomainError as error:
        return _error(error)


@finance_router.post("/plans")
async def save_plan(value: FinancePlanSaveInput, context: Context, service: Service) -> Any:
    try:
        result = await service.save_plan(value.model_dump(), context)
        return {"success": True, **result}
    except DomainError as error:
        return _error(error)


@finance_router.delete("/plans")
async def clear_plan(value: FinancePlanDeleteInput, context: Context, service: Service) -> Any:
    try:
        await service.clear_plan(value.model_dump(), context)
        return {"success": True}
    except DomainError as error:
        return _error(error)


@finance_router.get("/salary")
async def get_salary_table(request: Request, context: Context, service: Service) -> Any:
    raw_year = request.query_params.get("year") or str(date.today().year)
    try:
        year = int(raw_year)
    except ValueError:
        year = 0
    if year < 2000 or year > 2100:
        return JSONResponse({"error": "Проверьте год"}, status_code=400)
    try:
        return {"data": await service.get_salary_table(year, context)}
    except DomainError as error:
        return _error(error)


@project_payroll_router.get("/{project_id}/payroll")
async def get_project_payroll(
    project_id: str, request: Request, context: Context, service: Service
) -> Any:
    year = _legacy_int(request.query_params.get("year"), date.today().year)
    if year is None or year < 2000 or year > 2100:
        return JSONResponse({"error": "Invalid payroll year"}, status_code=400)
    try:
        return await service.get_project_payroll(project_id, year, context)
    except DomainError as error:
        return _error(error)


@project_payroll_router.put("/{project_id}/payroll")
async def save_project_payroll(
    project_id: str, value: ProjectPayrollSaveInput, context: Context, service: Service
) -> Any:
    try:
        result = await service.save_project_payroll(project_id, value.model_dump(), context)
        return {"success": True, **result}
    except DomainError as error:
        return _error(error)


@project_payroll_router.delete("/{project_id}/payroll")
async def clear_project_payroll(
    project_id: str, value: ProjectPayrollDeleteInput, context: Context, service: Service
) -> Any:
    try:
        await service.clear_project_payroll(project_id, value.model_dump(), context)
        return {"success": True}
    except DomainError as error:
        return _error(error)
