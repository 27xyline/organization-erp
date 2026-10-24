from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from app.api.dependencies import (
    get_authenticated_context,
    get_dashboard_service,
    get_export_service,
)
from app.core.context import RequestContext
from app.domain.errors import DomainError
from app.services.dashboard import DashboardService
from app.services.dto.reporting import DashboardQuery
from app.services.exports import ExportService

router = APIRouter(prefix="/reports", tags=["report-exports"])
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


@router.get("/export")
async def export_dashboard(
    context: Context,
    dashboard_service: Annotated[DashboardService, Depends(get_dashboard_service)],
    export_service: Annotated[ExportService, Depends(get_export_service)],
    date_from: Annotated[date | None, Query(alias="dateFrom")] = None,
    date_to: Annotated[date | None, Query(alias="dateTo")] = None,
    department_id: Annotated[str | None, Query(alias="departmentId", min_length=1)] = None,
    project_id: Annotated[str | None, Query(alias="projectId", min_length=1)] = None,
    output_format: Annotated[str, Query(alias="format", pattern="^(xlsx|docx|pdf)$")] = "xlsx",
) -> Response:
    actor = context.actor
    if actor is None or actor.access is None:
        raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)
    query = _query(date_from, date_to, department_id, project_id)
    data = await dashboard_service.get_overview(query, actor.access)
    result = await export_service.dashboard(
        data,
        query,
        actor.access,
        output_format,
        user_id=actor.actor_id,
        request_id=context.request_id,
    )
    return Response(
        result.body,
        status_code=200,
        media_type=result.media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{result.filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
