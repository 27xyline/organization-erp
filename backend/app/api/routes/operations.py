from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.api.routes.asset_access import get_asset_context
from app.api.routes.asset_queries import page_query
from app.api.routes.assets import pagination
from app.core.context import RequestContext
from app.domain.errors import DomainError
from app.services.assets import AssetService
from app.services.dto.assets import OperationQuery

router = APIRouter(prefix="/operations", tags=["operations"])


@router.get("")
async def operations(
    request: Request, context: Annotated[RequestContext, Depends(get_asset_context)]
) -> JSONResponse:
    assert context.actor is not None
    page, size = page_query(request)
    kind = request.query_params.get("type")
    if kind and kind not in {"RECEIPT", "TRANSFER", "DISPOSAL", "STATUS_CHANGE"}:
        raise DomainError("VALIDATION_ERROR", "Проверьте введённые данные", 422)
    rows, total = await AssetService(request.app.state.unit_of_work_factory).operations(
        OperationQuery(page, size, request.query_params.get("assetId"), kind), context.actor
    )
    return pagination(rows, page, size, total)
