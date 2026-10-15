"""Vacation and sick leave transport."""

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from app.api.dependencies import get_authenticated_context, get_workforce_service
from app.api.routes.employees import wire
from app.core.context import RequestContext
from app.domain.errors import DomainError
from app.domain.ports.employees import VacationItem
from app.schemas.employees import VacationInput
from app.services.dto.employees import VacationCommand
from app.services.workforce import WorkforceService

router = APIRouter(prefix="/vacations", tags=["vacations"])
Context = Annotated[RequestContext, Depends(get_authenticated_context)]
Service = Annotated[WorkforceService, Depends(get_workforce_service)]


async def save_preserving_fk_error(
    service: WorkforceService,
    identifier: str | None,
    command: VacationCommand,
    context: RequestContext,
) -> VacationItem:
    try:
        return await service.save_vacation(identifier, command, context)
    except DomainError as error:
        if error.code == "EMPLOYEE_NOT_FOUND":
            # The legacy route leaves an unknown employee FK violation unmapped (generic 500).
            raise RuntimeError("Vacation employee reference is missing") from error
        raise


@router.get("")
async def vacations(
    context: Context, service: Service, year: Annotated[int | None, Query(ge=2000, le=2200)] = None
) -> dict[str, Any]:
    assert context.actor is not None
    rows = await service.vacations(year or datetime.now().year, context.actor)
    return {"data": wire([row.as_dict() for row in rows])}


@router.post("")
async def create_vacation(input: VacationInput, context: Context, service: Service) -> JSONResponse:
    row = await save_preserving_fk_error(
        service, None, VacationCommand(**input.model_dump()), context
    )
    return JSONResponse({"data": wire(row.as_dict())}, status_code=201)


@router.put("/{identifier}")
async def update_vacation(
    identifier: str, input: VacationInput, context: Context, service: Service
) -> dict[str, Any]:
    row = await save_preserving_fk_error(
        service, identifier, VacationCommand(**input.model_dump()), context
    )
    return {"data": wire(row.as_dict())}


@router.delete("/{identifier}")
async def delete_vacation(identifier: str, context: Context, service: Service) -> dict[str, Any]:
    return {"data": await service.delete_vacation(identifier, context)}
