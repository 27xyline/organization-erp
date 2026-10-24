from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.domain.auth.rules import AccessContext, require_permission
from app.domain.errors import DomainError
from app.domain.ports.audit import AuditRecord
from app.integrations.exports import render_dashboard_xlsx, render_docx, render_pdf, safe_filename
from app.repositories.audit import SqlAlchemyAuditRepository
from app.services.dashboard import DashboardService
from app.services.dto.reporting import DashboardQuery

_MIME_TYPES = {
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf": "application/pdf",
}


@dataclass(frozen=True, slots=True)
class ExportArtifact:
    body: bytes
    filename: str
    media_type: str


class ExportService:
    def __init__(self, session_factory: async_sessionmaker[Any]) -> None:
        self._session_factory = session_factory

    async def dashboard(
        self,
        query: DashboardQuery,
        access: AccessContext,
        output_format: str = "xlsx",
        *,
        user_id: str,
        request_id: str | None = None,
    ) -> ExportArtifact:
        require_permission(access, "reports.export")
        if output_format not in _MIME_TYPES:
            raise DomainError("UNSUPPORTED_EXPORT_FORMAT", "Формат экспорта не поддерживается", 422)

        # Materialize authorized projections, then release the session before synchronous rendering.
        async with self._session_factory() as session:
            data = await DashboardService(session).get_overview(
                query, access, datetime.now(UTC).replace(tzinfo=None)
            )
        if output_format == "xlsx":
            body = await asyncio.to_thread(render_dashboard_xlsx, data)
        else:
            columns, rows = _flat_report(data)
            renderer = render_docx if output_format == "docx" else render_pdf
            body = await asyncio.to_thread(renderer, "Отчёт по dashboard", columns, rows)
        async with self._session_factory.begin() as audit_session:
            await SqlAlchemyAuditRepository(lambda: audit_session).append(
                AuditRecord(
                    "REPORT_EXPORT",
                    "Reporting",
                    f"{query.date_from.isoformat()}:{query.date_to.isoformat()}",
                    user_id,
                    {
                        "format": output_format.upper(),
                        "departmentId": query.department_id,
                        "projectId": query.project_id,
                    },
                    request_id,
                )
            )
        filename = safe_filename(
            f"consilium-report-{query.date_from.isoformat()}-{query.date_to.isoformat()}",
            output_format,
        )
        return ExportArtifact(body, filename, _MIME_TYPES[output_format])


def _flat_report(data: dict[str, Any]) -> tuple[list[str], list[list[Any]]]:
    rows: list[list[Any]] = [["Период", f"{data['query']['dateFrom']} — {data['query']['dateTo']}"]]
    summary = data["summary"]
    if data["visibility"]["employees"]:
        rows.extend(
            [
                ["Сотрудников", summary["headcount"]],
                ["Активных сотрудников", summary["active"]],
                ["Занято ставок", summary["occupiedRate"]],
                ["Штатных ставок", summary["staffRate"]],
            ]
        )
    if data["visibility"]["finance"]:
        rows.extend(
            [["Плановый ФОТ", summary["plannedFot"]], ["Фактический ФОТ", summary["actualFot"]]]
        )
    if data["visibility"]["projects"]:
        rows.extend(
            [
                ["Активных проектов", summary["count"]],
                ["Плановый бюджет", summary["plannedBudget"]],
                ["Фактический бюджет", summary["actualBudget"]],
            ]
        )
    if data["visibility"]["assets"]:
        rows.append(["Стоимость имущества", summary["assetValue"]])
    return ["Показатель", "Значение"], rows
