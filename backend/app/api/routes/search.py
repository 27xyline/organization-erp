from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse

from app.api.dependencies import get_authenticated_context
from app.core.context import RequestContext
from app.domain.errors import DomainError
from app.services.search import SearchService

router = APIRouter(prefix="/search", tags=["search"])
Context = Annotated[RequestContext, Depends(get_authenticated_context)]


@router.get("")
async def search(
    request: Request,
    context: Context,
    q: Annotated[str, Query(min_length=2, max_length=100)],
) -> JSONResponse:
    actor = context.actor
    if actor is None or actor.access is None:
        raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)
    if not any(
        actor.access.has(permission)
        for permission in (
            "employees.read",
            "assets.read",
            "projects.read",
            "tasks.read",
            "documents.read",
        )
    ):
        raise DomainError("FORBIDDEN", "Недостаточно прав", 403)
    async with request.app.state.session_factory() as session:
        items = await SearchService(session).search(q, actor.access)
    return JSONResponse(
        {"data": items},
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )
