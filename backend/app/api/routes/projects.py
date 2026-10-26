"""HTTP-адаптеры проектов и участников; расчёт зарплаты остаётся на стороне TypeScript."""

from math import ceil
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse

from app.api.dependencies import get_authenticated_context
from app.core.context import RequestContext
from app.domain.errors import DomainError
from app.schemas.projects import MemberCreateInput, MemberUpdateInput, ProjectInput
from app.services.dto.projects import ProjectCommand, ProjectListQuery
from app.services.project_members import ProjectMemberService
from app.services.project_workspace import ProjectWorkspaceService
from app.services.projects import ProjectService
from app.services.users import json_value

router = APIRouter(prefix="/projects", tags=["projects"])
Context = Annotated[RequestContext, Depends(get_authenticated_context)]


def get_service(request: Request) -> ProjectService:
    return ProjectService(request.app.state.unit_of_work_factory)


def get_members(request: Request) -> ProjectMemberService:
    return ProjectMemberService(request.app.state.unit_of_work_factory)


def get_workspace(request: Request) -> ProjectWorkspaceService:
    return ProjectWorkspaceService(request.app.state.unit_of_work_factory)


Service = Annotated[ProjectService, Depends(get_service)]
Members = Annotated[ProjectMemberService, Depends(get_members)]
Workspace = Annotated[ProjectWorkspaceService, Depends(get_workspace)]


@router.get("")
async def list_projects(
    context: Context,
    service: Service,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int | None, Query(alias="pageSize", ge=1, le=100)] = None,
    limit: Annotated[int | None, Query(ge=1, le=100)] = None,
    status: Literal["ACTIVE", "COMPLETED", "ARCHIVED"] | None = None,
) -> Any:
    assert context.actor is not None
    size = page_size or limit or 25
    result = await service.list(ProjectListQuery(page, size, status), context.actor)
    return {
        "data": json_value([item.values for item in result.projects]),
        "pagination": {
            "page": page,
            "pageSize": size,
            "total": result.total,
            "totalPages": max(1, ceil(result.total / size)),
        },
    }


@router.get("/references")
async def references(
    context: Context,
    service: Service,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 25,
    status: Literal["ACTIVE", "COMPLETED", "ARCHIVED"] | None = None,
) -> Any:
    assert context.actor is not None
    result = await service.list(
        ProjectListQuery(page, page_size, status), context.actor, references=True
    )
    return {
        "data": json_value([item.values for item in result.projects]),
        "meta": {"page": page, "pageSize": page_size, "total": result.total},
    }


@router.post("")
async def create_project(input: ProjectInput, context: Context, service: Service) -> JSONResponse:
    result = await service.create(ProjectCommand(**input.model_dump()), context)
    return JSONResponse({"data": json_value(result.values)}, status_code=201)


@router.get("/{project_id}")
async def get_project(project_id: str, context: Context, service: Service) -> Any:
    assert context.actor is not None
    return {"data": json_value((await service.get(project_id, context.actor)).values)}


@router.get("/{project_id}/workspace")
async def workspace(project_id: str, context: Context, service: Service) -> Any:
    assert context.actor is not None
    return {"data": json_value((await service.get(project_id, context.actor, detail=True)).values)}


@router.get("/{project_id}/activity")
async def activity(project_id: str, context: Context, service: Workspace) -> Any:
    assert context.actor is not None
    return {
        "data": json_value(
            [item.values for item in await service.activity(project_id, context.actor)]
        )
    }


@router.put("/{project_id}")
async def update_project(
    project_id: str, input: ProjectInput, context: Context, service: Service
) -> Any:
    return {
        "data": json_value(
            (await service.update(project_id, ProjectCommand(**input.model_dump()), context)).values
        )
    }


@router.delete("/{project_id}")
async def delete_project(project_id: str, context: Context, service: Service) -> Any:
    return {"data": await service.delete(project_id, context)}


def member_error(error: DomainError) -> JSONResponse:
    return JSONResponse({"error": error.message}, status_code=error.status_code)


@router.get("/{project_id}/members")
async def members(project_id: str, context: Context, service: Members) -> Any:
    assert context.actor is not None
    try:
        return json_value((await service.list(project_id, context.actor)).values)
    except DomainError as error:
        return member_error(error)


@router.post("/{project_id}/members")
async def add_member(
    project_id: str, input: MemberCreateInput, context: Context, service: Members
) -> Any:
    try:
        return {
            "success": True,
            "member": json_value((await service.add(project_id, input.employeeId, context)).values),
        }
    except DomainError as error:
        return member_error(error)


@router.patch("/{project_id}/members/{member_id}")
async def update_member(
    project_id: str, member_id: str, input: MemberUpdateInput, context: Context, service: Members
) -> Any:
    try:
        return {
            "success": True,
            "member": json_value(
                (await service.update(project_id, member_id, input.isArchived, context)).values
            ),
        }
    except DomainError as error:
        return member_error(error)
