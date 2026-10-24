from datetime import date, datetime, time
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from app.api.dependencies import get_authenticated_context
from app.core.context import RequestContext
from app.domain.errors import DomainError
from app.schemas.reporting import ReportPresetInput
from app.services.reporting import ReportingService

router = APIRouter(prefix="/reports", tags=["reports"])
Context = Annotated[RequestContext, Depends(get_authenticated_context)]


def _range(date_from: date, date_to: date) -> tuple[datetime, datetime]:
    if date_from > date_to:
        raise DomainError(
            "VALIDATION_ERROR", "Дата окончания должна быть не раньше даты начала", 422
        )
    return datetime.combine(date_from, time.min), datetime.combine(date_to, time.max)


def _service(request: Request) -> ReportingService:
    return ReportingService(request.app.state.session_factory)


@router.get("/turnover")
async def turnover(
    request: Request,
    context: Context,
    date_from: Annotated[date, Query(alias="dateFrom")],
    date_to: Annotated[date, Query(alias="dateTo")],
    department_id: Annotated[str | None, Query(alias="departmentId")] = None,
) -> dict[str, Any]:
    assert context.actor and context.actor.access
    start, end = _range(date_from, date_to)
    return await _service(request).turnover(start, end, department_id, context.actor.access)


@router.get("/profitability")
async def profitability(
    request: Request,
    context: Context,
    date_from: Annotated[date, Query(alias="dateFrom")],
    date_to: Annotated[date, Query(alias="dateTo")],
    project_id: Annotated[str | None, Query(alias="projectId")] = None,
) -> list[dict[str, Any]]:
    assert context.actor and context.actor.access
    start, end = _range(date_from, date_to)
    return await _service(request).profitability(start, end, project_id, context.actor.access)


@router.get("/depreciation")
async def depreciation(
    request: Request,
    context: Context,
    date_from: Annotated[date, Query(alias="dateFrom")],
    date_to: Annotated[date, Query(alias="dateTo")],
    department_id: Annotated[str | None, Query(alias="departmentId")] = None,
) -> dict[str, Any]:
    assert context.actor and context.actor.access
    start, end = _range(date_from, date_to)
    return await _service(request).depreciation(start, end, department_id, context.actor.access)


@router.get("/vacations")
async def vacations(
    request: Request,
    context: Context,
    date_from: Annotated[date, Query(alias="dateFrom")],
    date_to: Annotated[date, Query(alias="dateTo")],
    department_id: Annotated[str | None, Query(alias="departmentId")] = None,
) -> list[dict[str, Any]]:
    assert context.actor and context.actor.access
    start, end = _range(date_from, date_to)
    return await _service(request).vacation_calendar(
        start, end, department_id, context.actor.access
    )


@router.get("/presets")
async def list_presets(request: Request, context: Context) -> list[dict[str, Any]]:
    assert context.actor and context.actor.access
    return await _service(request).presets(context.actor.actor_id, context.actor.access)


@router.post("/presets", status_code=201)
async def save_preset(
    body: ReportPresetInput, request: Request, context: Context
) -> dict[str, Any]:
    assert context.actor and context.actor.access
    return await _service(request).save_preset(context.actor.actor_id, body, context.actor.access)


@router.delete("/presets")
async def delete_preset(
    request: Request,
    context: Context,
    preset_id: Annotated[str, Query(alias="id", min_length=1)],
) -> Response:
    assert context.actor and context.actor.access
    await _service(request).delete_preset(context.actor.actor_id, preset_id, context.actor.access)
    return Response(status_code=204)


class _CustomReportBody(BaseModel):
    preset: ReportPresetInput
    query: dict[str, Any] = Field(min_length=2, max_length=4)


@router.post("/custom")
async def custom_report(
    body: _CustomReportBody, request: Request, context: Context
) -> list[dict[str, Any]] | JSONResponse:
    assert context.actor and context.actor.access
    try:
        date_from = date.fromisoformat(str(body.query["dateFrom"]))
        date_to = date.fromisoformat(str(body.query["dateTo"]))
    except (KeyError, ValueError) as error:
        raise DomainError("VALIDATION_ERROR", "Проверьте период отчёта", 422) from error
    start, end = _range(date_from, date_to)
    return await _service(request).custom_report(
        body.preset,
        start,
        end,
        body.query.get("departmentId"),
        body.query.get("projectId"),
        context.actor.access,
    )
