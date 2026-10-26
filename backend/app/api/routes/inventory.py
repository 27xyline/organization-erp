from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.api.routes.asset_access import get_asset_context
from app.api.routes.asset_queries import page_query
from app.api.routes.assets import data, pagination
from app.core.context import RequestContext
from app.domain.errors import DomainError
from app.schemas.assets import CountInput, InventoryInput
from app.services.dto.assets import CountCommand, InventoryCommand
from app.services.inventory import InventoryService

router = APIRouter(prefix="/assets/inventories", tags=["inventory"])
Context = Annotated[RequestContext, Depends(get_asset_context)]


def service(request: Request) -> InventoryService:
    return InventoryService(request.app.state.unit_of_work_factory)


Service = Annotated[InventoryService, Depends(service)]


@router.get("")
async def list_inventories(request: Request, context: Context, service: Service) -> JSONResponse:
    assert context.actor is not None
    page, size = page_query(request)
    rows, total = await service.list_inventories(context.actor, page, size)
    return pagination(rows, page, size, total)


@router.post("")
async def create_inventory(
    input: InventoryInput, context: Context, service: Service
) -> JSONResponse:
    return data(
        await service.create_inventory(InventoryCommand(**input.model_dump()), context), 201
    )


@router.get("/options")
async def options(context: Context, service: Service) -> JSONResponse:
    assert context.actor is not None
    return data(await service.options(context.actor))


@router.get("/resolve")
async def resolve(request: Request, context: Context, service: Service) -> JSONResponse:
    assert context.actor is not None
    number = request.query_params.get("number", "").strip()
    if not number or len(number) > 100:
        raise DomainError("VALIDATION_ERROR", "Укажите корректный инвентарный номер", 422)
    return data(await service.resolve(number, context.actor))


@router.get("/{inventory_id}/act")
async def act(inventory_id: str, context: Context, service: Service) -> JSONResponse:
    assert context.actor is not None
    return data(await service.get_inventory(inventory_id, context.actor, size=5000, act=True))


@router.get("/{inventory_id}")
async def get_inventory(
    inventory_id: str, request: Request, context: Context, service: Service
) -> JSONResponse:
    assert context.actor is not None
    page, size = page_query(request, default_size=50)
    search = request.query_params.get("search")
    if search and len(search.strip()) > 120:
        raise DomainError("VALIDATION_ERROR", "Проверьте введённые данные", 422)
    return data(
        await service.get_inventory(
            inventory_id, context.actor, page, size, search.strip() if search else None
        )
    )


@router.post("/{inventory_id}/scan")
async def scan(
    inventory_id: str, input: CountInput, context: Context, service: Service
) -> JSONResponse:
    result = asdict(await service.scan(inventory_id, CountCommand(**input.model_dump()), context))
    result.pop("scannedBy")
    return data(result)


@router.post("/{inventory_id}/complete")
async def complete(inventory_id: str, context: Context, service: Service) -> JSONResponse:
    return data(await service.complete(inventory_id, context))
