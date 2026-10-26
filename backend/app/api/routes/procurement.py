from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from app.api.dependencies import get_authenticated_context
from app.core.context import RequestContext
from app.schemas.procurement import (
    ProcurementCapitalizeInput,
    ProcurementContractInput,
    ProcurementCreateInput,
    ProcurementDeliveryInput,
    ProcurementQueryInput,
    ProcurementSubmitInput,
    ProcurementUpdateInput,
    SupplierCreateInput,
)
from app.services.dto.procurement import (
    ProcurementCapitalizeCommand,
    ProcurementCommand,
    ProcurementContractCommand,
    ProcurementDeliveryCommand,
    ProcurementDeliveryLineCommand,
    ProcurementItemCommand,
    ProcurementQuery,
    ProcurementSubmitCommand,
    SupplierCommand,
)
from app.services.procurement import ProcurementService

router = APIRouter(prefix="/procurement", tags=["procurement"])
Context = Annotated[RequestContext, Depends(get_authenticated_context)]


def get_procurement_service(request: Request) -> ProcurementService:
    return ProcurementService(request.app.state.unit_of_work_factory)


Service = Annotated[ProcurementService, Depends(get_procurement_service)]


def _response(data: Any, status: int = 200) -> JSONResponse:
    return JSONResponse({"data": jsonable_encoder(data)}, status_code=status)


def _command(value: ProcurementCreateInput | ProcurementUpdateInput) -> ProcurementCommand:
    return ProcurementCommand(
        title=value.title,
        description=value.description,
        budgetLimit=Decimal(value.budgetLimit),
        neededBy=value.neededBy,
        projectId=value.projectId,
        documentId=value.documentId,
        items=tuple(
            ProcurementItemCommand(
                name=item.name,
                quantity=Decimal(item.quantity),
                unit=item.unit,
                unitPrice=Decimal(item.unitPrice),
                groupId=item.groupId,
            )
            for item in value.items
        ),
        number=value.number if isinstance(value, ProcurementCreateInput) else None,
    )


@router.get("")
async def list_procurement(request: Request, context: Context, service: Service) -> JSONResponse:
    query = ProcurementQueryInput.model_validate(dict(request.query_params))
    result = await service.list(
        ProcurementQuery(
            query.page,
            query.pageSize,
            query.search,
            query.status.value if query.status else None,
        ),
        context,
    )
    return JSONResponse(
        {
            "data": jsonable_encoder(result["requests"]),
            "pagination": {
                "page": query.page,
                "pageSize": query.pageSize,
                "total": result["total"],
                "totalPages": max(1, (result["total"] + query.pageSize - 1) // query.pageSize),
            },
            "summary": jsonable_encoder(result["summary"]),
        }
    )


@router.post("")
async def create_procurement(
    value: ProcurementCreateInput, context: Context, service: Service
) -> JSONResponse:
    return _response(await service.create(_command(value), context), 201)


@router.get("/options")
async def procurement_options(context: Context, service: Service) -> JSONResponse:
    return _response(await service.options(context))


@router.post("/suppliers")
async def create_supplier(
    value: SupplierCreateInput, context: Context, service: Service
) -> JSONResponse:
    return _response(
        await service.create_supplier(SupplierCommand(**value.model_dump()), context),
        201,
    )


@router.get("/{identifier}")
async def get_procurement(identifier: str, context: Context, service: Service) -> JSONResponse:
    return _response(await service.get(identifier, context))


@router.put("/{identifier}")
async def update_procurement(
    identifier: str, value: ProcurementUpdateInput, context: Context, service: Service
) -> JSONResponse:
    return _response(await service.update(identifier, _command(value), context))


@router.post("/{identifier}/submit")
async def submit_procurement(
    identifier: str, value: ProcurementSubmitInput, context: Context, service: Service
) -> JSONResponse:
    command = ProcurementSubmitCommand(
        tuple((step.name, step.approverId) for step in value.steps), value.dueAt
    )
    return _response(await service.submit(identifier, command, context))


@router.post("/{identifier}/contract")
async def create_contract(
    identifier: str, value: ProcurementContractInput, context: Context, service: Service
) -> JSONResponse:
    command = ProcurementContractCommand(**value.model_dump())
    return _response(await service.create_contract(identifier, command, context), 201)


@router.post("/{identifier}/deliveries")
async def create_delivery(
    identifier: str, value: ProcurementDeliveryInput, context: Context, service: Service
) -> JSONResponse:
    command = ProcurementDeliveryCommand(
        number=value.number,
        receivedAt=value.receivedAt,
        note=value.note,
        documentId=value.documentId,
        items=tuple(
            ProcurementDeliveryLineCommand(item.procurementItemId, item.quantity)
            for item in value.items
        ),
    )
    return _response(await service.create_delivery(identifier, command, context), 201)


@router.post("/delivery-items/{delivery_item_id}/capitalize")
async def capitalize_delivery_item(
    delivery_item_id: str,
    value: ProcurementCapitalizeInput,
    context: Context,
    service: Service,
) -> JSONResponse:
    return _response(
        await service.capitalize(
            delivery_item_id, ProcurementCapitalizeCommand(**value.model_dump()), context
        )
    )
