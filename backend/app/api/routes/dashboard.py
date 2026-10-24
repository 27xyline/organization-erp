from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import (
    get_authenticated_context,
    get_dashboard_service,
    get_my_actions_service,
)
from app.core.context import RequestContext
from app.domain.errors import DomainError
from app.services.dashboard import DashboardService
from app.services.dto.reporting import DashboardQuery
from app.services.my_actions import MyActionsService

router = APIRouter(tags=["dashboard"])
Context = Annotated[RequestContext, Depends(get_authenticated_context)]


def _query(
    date_from: date | None, date_to: date | None, department_id: str | None, project_id: str | None
) -> DashboardQuery:
    year = date.today().year
    start, end = date_from or date(year, 1, 1), date_to or date(year, 12, 31)
    if start > end:
        raise DomainError(
            "VALIDATION_ERROR", "Дата окончания должна быть не раньше даты начала", 422
        )
    return DashboardQuery(start, end, department_id, project_id)


@router.get("/dashboard")
async def dashboard(
    context: Context,
    service: Annotated[DashboardService, Depends(get_dashboard_service)],
    date_from: Annotated[date | None, Query(alias="dateFrom")] = None,
    date_to: Annotated[date | None, Query(alias="dateTo")] = None,
    department_id: Annotated[str | None, Query(alias="departmentId", min_length=1)] = None,
    project_id: Annotated[str | None, Query(alias="projectId", min_length=1)] = None,
) -> dict[str, object]:
    if context.actor is None or context.actor.access is None:
        raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)
    query = _query(date_from, date_to, department_id, project_id)
    return await service.get_overview(query, context.actor.access)


@router.get("/my-actions")
async def my_actions(
    context: Context,
    service: Annotated[MyActionsService, Depends(get_my_actions_service)],
) -> dict[str, object]:
    actor = context.actor
    if actor is None or actor.access is None:
        raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)
    return await service.get_for_user(
        actor.actor_id, actor.employee_id, actor.access
    )
