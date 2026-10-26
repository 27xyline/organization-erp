"""Транспорт расписания сотрудников; финансовые расчёты остаются в сервисах финансов."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.api.dependencies import get_authenticated_context, get_workforce_service
from app.api.routes.employees import wire
from app.core.context import RequestContext
from app.schemas.employees import StaffInput
from app.services.dto.employees import StaffCommand
from app.services.workforce import WorkforceService

router = APIRouter(prefix="/staff-schedule", tags=["staff-schedule"])
Context = Annotated[RequestContext, Depends(get_authenticated_context)]
Service = Annotated[WorkforceService, Depends(get_workforce_service)]


@router.get("")
async def positions(context: Context, service: Service) -> dict[str, Any]:
    assert context.actor is not None
    return {"data": wire([row.as_dict() for row in await service.positions(context.actor)])}


@router.post("")
async def create_position(input: StaffInput, context: Context, service: Service) -> JSONResponse:
    row = await service.save_position(None, StaffCommand(**input.model_dump()), context)
    return JSONResponse({"data": wire(row.as_dict(department_ref=False))}, status_code=201)


@router.put("/{identifier}")
async def update_position(
    identifier: str, input: StaffInput, context: Context, service: Service
) -> dict[str, Any]:
    row = await service.save_position(identifier, StaffCommand(**input.model_dump()), context)
    return {"data": wire(row.as_dict(department_ref=False))}


@router.delete("/{identifier}")
async def delete_position(identifier: str, context: Context, service: Service) -> dict[str, Any]:
    return {"data": await service.delete_position(identifier, context)}
