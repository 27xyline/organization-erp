"""HTTP-эндпоинты подразделений и связанных с ними SSR-справочников."""

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from app.api.dependencies import get_authenticated_context, get_department_service
from app.core.context import RequestContext
from app.schemas.departments import DepartmentCreateInput, DepartmentUpdateInput
from app.services.departments import DepartmentService
from app.services.dto.departments import DepartmentCommand, DepartmentListQuery
from app.services.users import json_value

router = APIRouter(prefix="/departments", tags=["departments"])
Context = Annotated[RequestContext, Depends(get_authenticated_context)]
Service = Annotated[DepartmentService, Depends(get_department_service)]


@router.get("")
async def list_departments(
    context: Context,
    service: Service,
    active_only: Annotated[Literal["true", "false"], Query(alias="activeOnly")] = "false",
) -> dict[str, Any]:
    assert context.actor is not None
    result = await service.list(DepartmentListQuery(active_only == "true"), context.actor)
    return {"data": json_value([item.as_dict() for item in result])}


@router.get("/references")
async def department_references(context: Context, service: Service) -> dict[str, Any]:
    assert context.actor is not None
    references = await service.references(context.actor)
    return {
        "data": {
            "parentCandidates": json_value(
                [item.as_dict() for item in references.parent_candidates]
            ),
            "headCandidates": json_value(
                [
                    {
                        "id": item.id,
                        "code": item.code,
                        "fullName": item.full_name,
                        "departmentId": item.department_id,
                    }
                    for item in references.head_candidates
                ]
            ),
        }
    }


@router.post("")
async def create_department(
    input: DepartmentCreateInput, context: Context, service: Service
) -> JSONResponse:
    command = DepartmentCommand(**input.model_dump(by_alias=False))
    result = await service.create(command, context)
    return JSONResponse(jsonable_encoder({"data": json_value(result.as_dict())}), status_code=201)


@router.patch("/{department_id}")
async def update_department(
    department_id: str, input: DepartmentUpdateInput, context: Context, service: Service
) -> dict[str, Any]:
    values = input.model_dump(exclude_unset=True)
    fields = input.model_fields_set
    command = DepartmentCommand(
        **values,
        parent_id_set="parent_id" in fields,
        head_employee_id_set="head_employee_id" in fields,
    )
    result = await service.update(department_id, command, context)
    return {"data": json_value(result.as_dict())}


@router.delete("/{department_id}")
async def delete_department(
    department_id: str, context: Context, service: Service
) -> dict[str, Any]:
    return {"data": await service.delete(department_id, context)}
