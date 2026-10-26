import math
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from app.api.dependencies import get_authenticated_context, get_user_service
from app.core.context import RequestContext
from app.schemas.users import CreateUserInput, UpdateUserInput
from app.services.users import UserService, json_value

router = APIRouter(prefix="/users", tags=["users"])
Context = Annotated[RequestContext, Depends(get_authenticated_context)]
Service = Annotated[UserService, Depends(get_user_service)]


@router.get("")
async def list_users(
    context: Context,
    service: Service,
    page: Annotated[int, Query(ge=1)] = 1,
    pageSize: Annotated[int, Query(ge=1, le=100)] = 25,
) -> Any:
    assert context.actor is not None
    users, total = await service.list_users(page, pageSize, context.actor)
    return {
        "data": json_value(users),
        "pagination": {
            "page": page,
            "pageSize": pageSize,
            "total": total,
            "totalPages": max(1, math.ceil(total / pageSize)),
        },
    }


@router.get("/references")
async def references(context: Context, service: Service) -> Any:
    assert context.actor is not None
    return {"data": await service.references(context.actor)}


@router.post("")
async def create_user(input: CreateUserInput, context: Context, service: Service) -> JSONResponse:
    result = await service.create(input.model_dump(), context)
    return JSONResponse(jsonable_encoder({"data": json_value(result)}), status_code=201)


@router.patch("/{user_id}")
async def update_user(
    user_id: str, input: UpdateUserInput, context: Context, service: Service
) -> Any:
    return {
        "data": json_value(
            await service.update(user_id, input.model_dump(exclude_unset=True), context)
        )
    }
