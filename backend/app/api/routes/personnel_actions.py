"""Personnel action HTTP contracts."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from app.api.dependencies import get_authenticated_context, get_personnel_action_service
from app.api.routes.employees import paged, wire
from app.core.context import RequestContext
from app.domain.employees.employment import ERRORS
from app.domain.errors import DomainError
from app.schemas.employees import PersonnelInput
from app.services.dto.employees import EmployeeListQuery
from app.services.personnel_actions import PersonnelActionService

router = APIRouter(prefix="/personnel-actions", tags=["personnel-actions"])
Context = Annotated[RequestContext, Depends(get_authenticated_context)]
Service = Annotated[PersonnelActionService, Depends(get_personnel_action_service)]


@router.get("")
async def actions(
    context: Context,
    service: Service,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int | None, Query(alias="pageSize", ge=1, le=100)] = None,
    limit: Annotated[int | None, Query(ge=1, le=100)] = None,
) -> dict[str, Any]:
    assert context.actor is not None
    size = page_size or limit or 50
    rows, total = await service.list(EmployeeListQuery(page=page, page_size=size), context.actor)
    return paged(rows, total, page, size)


@router.post("")
async def create_action(input: PersonnelInput, context: Context, service: Service) -> JSONResponse:
    try:
        result = await service.create(input.command(), context)
    except DomainError as error:
        if error.code in ERRORS:
            raise DomainError(
                "PERSONNEL_ACTION_INVALID", error.message, error.status_code
            ) from error
        raise
    return JSONResponse({"data": wire(result.as_dict())}, status_code=201)


@router.post("/sync")
async def sync(context: Context, service: Service) -> dict[str, Any]:
    count = await service.sync(context)
    return {"data": {"success": True, "createdCount": count}}


@router.delete("/{identifier}")
async def delete_action(identifier: str, context: Context, service: Service) -> dict[str, Any]:
    # This legacy missing-record branch was an unmapped service error (generic 500).
    try:
        return {"data": await service.delete(identifier, context)}
    except DomainError as error:
        if error.code == "INVALID_ACTION_DATE":
            raise RuntimeError("Personnel action deletion failed") from error
        raise
