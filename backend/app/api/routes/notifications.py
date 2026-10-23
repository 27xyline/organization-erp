"""Authenticated in-app notifications and preference endpoints."""

from math import ceil
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.api.dependencies import get_authenticated_context
from app.core.context import RequestContext
from app.schemas.notifications import (
    NotificationPreferencesInput,
    NotificationQueryInput,
    NotificationStateInput,
)
from app.services.dto.notifications import NotificationQuery
from app.services.notifications import NotificationService
from app.services.users import json_value

router = APIRouter(prefix="/notifications", tags=["notifications"])
Context = Annotated[RequestContext, Depends(get_authenticated_context)]


def service(request: Request) -> NotificationService:
    return NotificationService(request.app.state.unit_of_work_factory)


Service = Annotated[NotificationService, Depends(service)]


def invalid(error: ValidationError) -> JSONResponse:
    fields: dict[str, list[str]] = {}
    for item in error.errors():
        key = str(item["loc"][-1]) if item["loc"] else "preferences"
        fields.setdefault(key, []).append(str(item["msg"]).removeprefix("Value error, "))
    return JSONResponse(
        {
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Проверьте введённые данные",
                "fieldErrors": fields,
            }
        },
        status_code=422,
    )


@router.get("")
async def list_notifications(
    context: Context,
    service: Service,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
    unread_only: Annotated[str, Query(alias="unreadOnly")] = "false",
) -> Any:
    try:
        query = NotificationQueryInput.model_validate(
            {"page": page, "pageSize": page_size, "unreadOnly": unread_only}
        )
    except ValidationError as error:
        return invalid(error)
    records, total = await service.list_notifications(
        NotificationQuery(**query.model_dump()), context
    )
    return {
        "data": json_value(records),
        "pagination": {
            "page": query.page,
            "pageSize": query.pageSize,
            "total": total,
            "totalPages": max(1, ceil(total / query.pageSize)),
        },
    }


@router.get("/unread-count")
async def unread_count(context: Context, service: Service) -> Any:
    return {"data": {"count": await service.unread_count(context)}}


@router.post("/read-all")
async def read_all(context: Context, service: Service) -> Any:
    return {"data": {"updated": await service.mark_all_read(context)}}


@router.get("/preferences")
async def get_preferences(context: Context, service: Service) -> Any:
    return {"data": await service.get_preferences(context)}


@router.put("/preferences")
async def update_preferences(request: Request, context: Context, service: Service) -> Any:
    try:
        parsed = NotificationPreferencesInput.model_validate(await request.json())
    except (ValidationError, ValueError, UnicodeError) as error:
        if isinstance(error, ValidationError):
            return invalid(error)
        return JSONResponse(
            {
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Проверьте введённые данные",
                    "fieldErrors": {},
                }
            },
            status_code=422,
        )
    return {
        "data": await service.update_preferences(
            [item.model_dump() for item in parsed.preferences], context
        )
    }


@router.patch("/{identifier}")
async def set_read(identifier: str, request: Request, context: Context, service: Service) -> Any:
    try:
        parsed = NotificationStateInput.model_validate(await request.json())
    except (ValidationError, ValueError, UnicodeError) as error:
        if isinstance(error, ValidationError):
            return invalid(error)
        return JSONResponse(
            {
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Проверьте введённые данные",
                    "fieldErrors": {},
                }
            },
            status_code=422,
        )
    await service.set_read(identifier, parsed.read, context)
    return {"data": {"id": identifier, "read": parsed.read}}


@router.delete("/{identifier}")
async def delete(identifier: str, context: Context, service: Service) -> Any:
    await service.delete(identifier, context)
    return {"data": {"id": identifier, "deleted": True}}
