from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Query, Request
from fastapi.responses import JSONResponse

from app.api.dependencies import get_authenticated_context
from app.core.context import RequestContext
from app.schemas.timekeeping import (
    SubmitTimesheetInput,
    TimeEntryDeleteInput,
    TimeEntryInput,
    TimeEntryUpdateInput,
    TimesheetDecisionInput,
)
from app.services.dto.timekeeping import TimeEntryUpdateCommand
from app.services.timekeeping import TimekeepingService
from app.services.users import json_value

router = APIRouter(tags=["timekeeping"])
Context = Annotated[RequestContext, Depends(get_authenticated_context)]


def get_service(request: Request) -> TimekeepingService:
    return TimekeepingService(request.app.state.unit_of_work_factory)


Service = Annotated[TimekeepingService, Depends(get_service)]


@router.get("/time-entries")
async def month_entries(
    context: Context,
    service: Service,
    year: Annotated[int, Query(ge=2000, le=2100)],
    month: Annotated[int, Query(ge=1, le=12)],
    employee_id: str | None = Query(default=None, alias="employeeId"),
    project_id: str | None = Query(default=None, alias="projectId"),
) -> Any:
    return {"data": json_value(await service.month(year, month, context, employee_id, project_id))}


@router.post("/time-entries")
async def create_entry(value: TimeEntryInput, context: Context, service: Service) -> JSONResponse:
    return JSONResponse({"data": json_value(await service.create(value, context))}, status_code=201)


@router.put("/time-entries/{entry_id}")
async def update_entry(
    entry_id: str, value: TimeEntryUpdateInput, context: Context, service: Service
) -> Any:
    command = TimeEntryUpdateCommand(
        values=value.model_dump(exclude_unset=True),
        correctionReason=value.correctionReason,
    )
    return {"data": json_value(await service.update(entry_id, command, context))}


@router.delete("/time-entries/{entry_id}")
async def delete_entry(
    entry_id: str,
    context: Context,
    service: Service,
    value: Annotated[TimeEntryDeleteInput | None, Body()] = None,
) -> Any:
    await service.remove(entry_id, context, value.correctionReason if value else None)
    return {"data": {"success": True}}


@router.post("/timekeeping/timesheets")
async def submit_timesheet(
    value: SubmitTimesheetInput, context: Context, service: Service
) -> JSONResponse:
    return JSONResponse({"data": json_value(await service.submit(value, context))}, status_code=201)


@router.post("/timekeeping/timesheets/{timesheet_id}/decision")
async def decide_timesheet(
    timesheet_id: str, value: TimesheetDecisionInput, context: Context, service: Service
) -> Any:
    return {"data": json_value(await service.decide(timesheet_id, value, context))}
