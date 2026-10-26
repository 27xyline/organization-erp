"""HTTP-адаптеры задач, зависимостей, контрольных списков и комментариев."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.api.dependencies import get_authenticated_context
from app.core.context import RequestContext
from app.schemas.projects import CommentInput, TaskCreateInput, TaskUpdateInput
from app.services.dto.projects import TaskCommand
from app.services.tasks import TaskService
from app.services.users import json_value

router = APIRouter(tags=["tasks"])
Context = Annotated[RequestContext, Depends(get_authenticated_context)]


def get_service(request: Request) -> TaskService:
    return TaskService(request.app.state.unit_of_work_factory)


Service = Annotated[TaskService, Depends(get_service)]


@router.get("/projects/{project_id}/tasks")
async def list_tasks(project_id: str, context: Context, service: Service) -> Any:
    assert context.actor is not None
    return {
        "data": json_value([item.values for item in await service.list(project_id, context.actor)])
    }


@router.post("/projects/{project_id}/tasks")
async def create_task(
    project_id: str, input: TaskCreateInput, context: Context, service: Service
) -> JSONResponse:
    result = await service.create(project_id, TaskCommand.from_values(input.model_dump()), context)
    return JSONResponse({"data": json_value(result.values)}, status_code=201)


@router.put("/tasks/{task_id}")
async def update_task(
    task_id: str, input: TaskUpdateInput, context: Context, service: Service
) -> Any:
    result = await service.update(
        task_id, TaskCommand.from_values(input.model_dump(exclude_unset=True)), context
    )
    return {"data": json_value(result.values)}


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, context: Context, service: Service) -> Any:
    return {"data": await service.delete(task_id, context)}


@router.post("/tasks/{task_id}/comments")
async def add_comment(
    task_id: str, input: CommentInput, context: Context, service: Service
) -> JSONResponse:
    return JSONResponse(
        {"data": json_value((await service.add_comment(task_id, input.body, context)).values)},
        status_code=201,
    )
