"""HTTP-адаптеры для существующего URL согласований и контрактов ответов."""

from math import ceil
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.api.dependencies import get_authenticated_context
from app.core.context import RequestContext
from app.domain.errors import DomainError
from app.schemas.approvals import (
    ApprovalCreateInput,
    ApprovalDecisionInput,
    ApprovalQueryInput,
    ApprovalTemplateCreateInput,
    ApprovalTemplateUpdateInput,
)
from app.services.approvals import ApprovalService
from app.services.dto.approvals import ApprovalCommand, ApprovalDecisionCommand, ApprovalStepCommand
from app.services.users import json_value

router = APIRouter(prefix="/approvals", tags=["approvals"])
Context = Annotated[RequestContext, Depends(get_authenticated_context)]


def service(request: Request) -> ApprovalService:
    return ApprovalService(request.app.state.unit_of_work_factory)


Service = Annotated[ApprovalService, Depends(service)]


def validation(error: ValidationError) -> JSONResponse:
    fields: dict[str, list[str]] = {}
    for item in error.errors():
        location = [part for part in item["loc"] if part != "body"]
        key = str(location[-1]) if location else "steps"
        message = str(item["msg"]).removeprefix("Value error, ")
        fields.setdefault(key, []).append(message)
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


async def parse_body(request: Request, schema: type[Any]) -> Any:
    try:
        return schema.model_validate(await request.json())
    except (ValidationError, ValueError, UnicodeError) as error:
        if isinstance(error, ValidationError):
            return validation(error)
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


@router.get("")
async def list_approvals(
    context: Context,
    service: Service,
    request: Request,
) -> Any:
    try:
        query = ApprovalQueryInput.model_validate(dict(request.query_params))
    except ValidationError as error:
        return validation(error)
    values = query.model_dump()
    values["search"] = query.search.strip() if query.search else None
    records, total = await service.list_approvals(values, context)
    return {
        "data": json_value(records),
        "pagination": {
            "page": query.page,
            "pageSize": query.pageSize,
            "total": total,
            "totalPages": max(1, ceil(total / query.pageSize)),
        },
    }


@router.post("")
async def create_approval(request: Request, context: Context, service: Service) -> Any:
    from app.services.users import authorize

    assert context.actor is not None
    authorize(context.actor, "approvals.create")
    parsed = await parse_body(request, ApprovalCreateInput)
    if isinstance(parsed, JSONResponse):
        return parsed
    command = ApprovalCommand(
        title=parsed.title,
        description=parsed.description,
        documentId=parsed.documentId,
        projectId=parsed.projectId,
        entityType=parsed.entityType,
        entityId=parsed.entityId,
        dueAt=parsed.dueAt,
        steps=tuple(ApprovalStepCommand(step.approverId, step.name) for step in parsed.steps),
    )
    return JSONResponse(
        {"data": json_value(await service.create(command, context))}, status_code=201
    )


@router.get("/options")
async def approver_options(context: Context, service: Service) -> Any:
    return {"data": await service.approvers(context)}


@router.get("/templates")
async def list_templates(context: Context, service: Service) -> Any:
    return {"data": await service.templates(context)}


@router.post("/templates")
async def create_template(request: Request, context: Context, service: Service) -> Any:
    from app.services.users import authorize

    assert context.actor is not None
    authorize(context.actor, "approvals.templates.manage")
    parsed = await parse_body(request, ApprovalTemplateCreateInput)
    if isinstance(parsed, JSONResponse):
        return parsed
    try:
        result = await service.create_template(
            parsed.name, [step.model_dump() for step in parsed.steps], context
        )
    except DomainError as exc:
        if exc.code != "APPROVAL_TEMPLATE_EXISTS":
            raise
        return JSONResponse(
            {
                "error": {
                    "code": "APPROVAL_TEMPLATE_EXISTS",
                    "message": "Шаблон с таким названием уже существует",
                }
            },
            status_code=409,
        )
    return JSONResponse({"data": result}, status_code=201)


@router.patch("/templates/{identifier}")
async def update_template(
    identifier: str, request: Request, context: Context, service: Service
) -> Any:
    from app.services.users import authorize

    assert context.actor is not None
    authorize(context.actor, "approvals.templates.manage")
    parsed = await parse_body(request, ApprovalTemplateUpdateInput)
    if isinstance(parsed, JSONResponse):
        return parsed
    values = parsed.model_dump(exclude_unset=True)
    if values.get("steps") is not None:
        values["steps"] = [step.model_dump() for step in parsed.steps or []]
    result = await service.update_template(identifier, values, context)
    return {"data": result}


@router.get("/{identifier}")
async def get_approval(identifier: str, context: Context, service: Service) -> Any:
    return {"data": json_value(await service.get(identifier, context))}


@router.post("/{identifier}/decision")
async def decide(identifier: str, request: Request, context: Context, service: Service) -> Any:
    from app.services.users import authorize

    assert context.actor is not None
    authorize(context.actor, "approvals.decide")
    parsed = await parse_body(request, ApprovalDecisionInput)
    if isinstance(parsed, JSONResponse):
        return parsed
    result = await service.decide(
        identifier, ApprovalDecisionCommand(parsed.decision, parsed.comment), context
    )
    return {"data": json_value(result)}


@router.post("/{identifier}/cancel")
async def cancel(identifier: str, context: Context, service: Service) -> Any:
    return {"data": json_value(await service.cancel(identifier, context))}
