"""HTTP-эндпоинты групп имущества и материально ответственных лиц."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from app.api.dependencies import get_authenticated_context, get_catalog_service
from app.core.context import RequestContext
from app.domain.errors import DomainError
from app.schemas.catalogs import GroupInput, MolInput
from app.services.catalogs import CatalogService
from app.services.dto.catalogs import GroupCommand, MolCommand
from app.services.users import json_value

router = APIRouter(tags=["asset catalogs"])
Context = Annotated[RequestContext, Depends(get_authenticated_context)]
Service = Annotated[CatalogService, Depends(get_catalog_service)]


@router.get("/groups")
async def list_groups(context: Context, service: Service) -> dict[str, Any]:
    assert context.actor is not None
    result = await service.list_groups(context.actor)
    return {"data": json_value([item.as_dict() for item in result])}


@router.post("/groups")
async def create_group(input: GroupInput, context: Context, service: Service) -> JSONResponse:
    command = GroupCommand(
        code=input.code,
        name=input.name,
        description=input.description,
        present_fields=frozenset(input.model_fields_set),
    )
    result = await service.create_group(command, context)
    return JSONResponse(jsonable_encoder({"data": json_value(result.as_dict())}), status_code=201)


@router.get("/groups/{group_id}")
async def get_group(group_id: str, context: Context, service: Service) -> dict[str, Any]:
    assert context.actor is not None
    result = await service.get_group(group_id, context.actor)
    if result is None:
        raise DomainError("NOT_FOUND", "Группа не найдена", 404)
    return {"data": json_value(result.as_dict())}


@router.put("/groups/{group_id}")
async def update_group(
    group_id: str, input: GroupInput, context: Context, service: Service
) -> dict[str, Any]:
    command = GroupCommand(
        code=input.code,
        name=input.name,
        description=input.description,
        present_fields=frozenset(input.model_fields_set),
    )
    result = await service.update_group(group_id, command, context)
    return {"data": json_value(result.as_dict())}


@router.delete("/groups/{group_id}")
async def delete_group(group_id: str, context: Context, service: Service) -> dict[str, Any]:
    return {"data": await service.delete_group(group_id, context)}


@router.get("/mols")
async def list_mols(context: Context, service: Service) -> dict[str, Any]:
    assert context.actor is not None
    result = await service.list_mols(context.actor)
    return {"data": json_value([item.as_dict() for item in result])}


@router.get("/mols/references")
async def mol_references(context: Context, service: Service) -> dict[str, Any]:
    assert context.actor is not None
    references = await service.mol_references(context.actor)
    return {
        "data": {
            "departments": [
                {
                    "id": item.id,
                    "code": item.code,
                    "name": item.name,
                    "isActive": item.is_active,
                }
                for item in references.departments
            ]
        }
    }


@router.post("/mols")
async def create_mol(input: MolInput, context: Context, service: Service) -> JSONResponse:
    command = MolCommand(
        code=input.code,
        department_id=input.department_id,
        department=input.department,
        full_name=input.full_name,
        storage_location=input.storage_location,
        photo=input.photo,
        present_fields=frozenset(input.model_fields_set),
    )
    result = await service.create_mol(command, context)
    return JSONResponse(jsonable_encoder({"data": json_value(result.as_dict())}), status_code=201)


@router.get("/mols/{mol_id}")
async def get_mol(mol_id: str, context: Context, service: Service) -> dict[str, Any]:
    assert context.actor is not None
    result = await service.get_mol(mol_id, context.actor)
    if result is None:
        raise DomainError("NOT_FOUND", "МОЛ не найден", 404)
    return {"data": json_value(result.as_dict())}


@router.put("/mols/{mol_id}")
async def update_mol(
    mol_id: str, input: MolInput, context: Context, service: Service
) -> dict[str, Any]:
    command = MolCommand(
        code=input.code,
        department_id=input.department_id,
        department=input.department,
        full_name=input.full_name,
        storage_location=input.storage_location,
        photo=input.photo,
        present_fields=frozenset(input.model_fields_set),
    )
    result = await service.update_mol(mol_id, command, context)
    return {"data": json_value(result.as_dict())}


@router.delete("/mols/{mol_id}")
async def delete_mol(mol_id: str, context: Context, service: Service) -> dict[str, Any]:
    return {"data": await service.delete_mol(mol_id, context)}
