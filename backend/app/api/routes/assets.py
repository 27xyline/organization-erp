"""HTTP-адаптеры имущества. Команды приложения не зависят от транспортного слоя."""

from collections.abc import Callable
from dataclasses import asdict
from typing import Annotated, Any
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import get_asset_qr_renderer
from app.api.routes.asset_access import get_asset_context
from app.core.context import RequestContext
from app.domain.errors import DomainError
from app.schemas.assets import (
    ArchiveInput,
    AssetInput,
    AssetUpdateInput,
    MaintenanceCreateInput,
    MaintenanceUpdateInput,
    MovementInput,
    SavedViewInput,
    TransferInput,
)
from app.services.asset_lifecycle import AssetLifecycleService
from app.services.assets import AssetService, asset_json
from app.services.dto.assets import (
    AssetCommand,
    MaintenanceCommand,
    MovementCommand,
    SavedViewCommand,
)
from app.services.saved_views import SavedViewService

router = APIRouter(prefix="/assets", tags=["assets"])
Context = Annotated[RequestContext, Depends(get_asset_context)]


def service(request: Request) -> AssetService:
    return AssetService(request.app.state.unit_of_work_factory)


Service = Annotated[AssetService, Depends(service)]


def data(value: Any, status: int = 200) -> JSONResponse:
    return JSONResponse({"data": asset_json(value)}, status_code=status)


def pagination(values: Any, page: int, size: int, total: int) -> JSONResponse:
    return JSONResponse(
        {
            "data": asset_json(values),
            "pagination": {
                "page": page,
                "pageSize": size,
                "total": total,
                "totalPages": max(1, (total + size - 1) // size),
            },
        }
    )


@router.get("")
async def list_assets(request: Request, context: Context, service: Service) -> JSONResponse:
    from app.api.routes.asset_queries import asset_query

    query = asset_query(request)
    assert context.actor is not None
    result = await service.list(query, context.actor)
    return pagination(
        [row.values() for row in result.assets], query.page, query.pageSize, result.total
    )


@router.post("")
async def create_asset(input: AssetInput, context: Context, service: Service) -> JSONResponse:
    return data((await service.create(AssetCommand(**input.model_dump()), context)).values(), 201)


@router.get("/catalogs")
async def catalogs(context: Context, service: Service) -> JSONResponse:
    assert context.actor is not None
    return data(await service.catalogs(context.actor))


@router.get("/saved-views")
async def list_views(request: Request, context: Context) -> JSONResponse:
    assert context.actor is not None
    return data(
        [
            asdict(row)
            for row in await SavedViewService(request.app.state.unit_of_work_factory).list_views(
                context.actor
            )
        ]
    )


@router.post("/saved-views")
async def create_view(input: SavedViewInput, request: Request, context: Context) -> JSONResponse:
    filters = input.filters.model_dump(exclude_none=True)
    if not filters.get("search"):
        filters.pop("search", None)
    return data(
        asdict(
            await SavedViewService(request.app.state.unit_of_work_factory).create_view(
                SavedViewCommand(input.name, filters), context
            )
        ),
        201,
    )


@router.delete("/saved-views/{view_id}")
async def delete_view(view_id: str, request: Request, context: Context) -> Response:
    deleted = await SavedViewService(request.app.state.unit_of_work_factory).delete_view(
        view_id, context
    )
    if not deleted:
        raise DomainError("SAVED_VIEW_NOT_FOUND", "Представление не найдено", 404)
    return Response(status_code=204)


@router.get("/{asset_id}/qr")
async def qr(
    asset_id: str,
    request: Request,
    context: Context,
    service: Service,
    renderer: Annotated[Callable[[str], bytes], Depends(get_asset_qr_renderer)],
    origin: str | None = None,
) -> Response:
    assert context.actor is not None
    asset = await service.get(asset_id, context.actor, hidden=True)
    base = origin or str(request.base_url).rstrip("/")
    url = (
        base.rstrip("/") + "/assets/inventory/scan?" + urlencode({"number": asset.inventoryNumber})
    )

    return Response(
        await run_in_threadpool(renderer, url),
        media_type="image/svg+xml; charset=utf-8",
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.get("/{asset_id}/maintenance")
async def maintenance(asset_id: str, request: Request, context: Context) -> JSONResponse:
    assert context.actor is not None
    return data(
        [
            asdict(row)
            for row in await AssetLifecycleService(
                request.app.state.unit_of_work_factory
            ).list_maintenance(asset_id, context.actor)
        ]
    )


@router.post("/{asset_id}/maintenance")
async def create_maintenance(
    asset_id: str, input: MaintenanceCreateInput, request: Request, context: Context
) -> JSONResponse:
    return data(
        asdict(
            await AssetLifecycleService(request.app.state.unit_of_work_factory).create_maintenance(
                asset_id, MaintenanceCommand(**input.model_dump()), context
            )
        ),
        201,
    )


@router.put("/{asset_id}/maintenance/{maintenance_id}")
async def update_maintenance(
    asset_id: str,
    maintenance_id: str,
    input: MaintenanceUpdateInput,
    request: Request,
    context: Context,
) -> JSONResponse:
    return data(
        asdict(
            await AssetLifecycleService(request.app.state.unit_of_work_factory).update_maintenance(
                asset_id,
                maintenance_id,
                MaintenanceCommand(**input.model_dump(), present=frozenset(input.model_fields_set)),
                context,
            )
        )
    )


@router.get("/{asset_id}")
async def get_asset(asset_id: str, context: Context, service: Service) -> JSONResponse:
    assert context.actor is not None
    return data((await service.get(asset_id, context.actor)).values())


@router.put("/{asset_id}")
async def update_asset(
    asset_id: str, input: AssetUpdateInput, context: Context, service: Service
) -> JSONResponse:
    return data(
        (await service.update(asset_id, AssetCommand(**input.model_dump()), context)).values()
    )


@router.post("/{asset_id}/transfers")
async def transfer(
    asset_id: str, input: TransferInput, context: Context, service: Service
) -> JSONResponse:
    return data(
        (await service.transfer(asset_id, MovementCommand(**input.model_dump()), context)).values(),
        201,
    )


@router.post("/{asset_id}/disposals")
async def disposal(
    asset_id: str, input: MovementInput, context: Context, service: Service
) -> JSONResponse:
    return data(
        (await service.dispose(asset_id, MovementCommand(**input.model_dump()), context)).values(),
        201,
    )


@router.post("/{asset_id}/archive")
async def archive(
    asset_id: str, input: ArchiveInput, context: Context, service: Service
) -> JSONResponse:
    return data((await service.archive(asset_id, input.reason, context)).values())


@router.post("/{asset_id}/restore")
async def restore(asset_id: str, context: Context, service: Service) -> JSONResponse:
    return data((await service.restore(asset_id, context)).values())
