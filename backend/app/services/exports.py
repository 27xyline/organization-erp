from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from app.domain.auth.rules import AccessContext, require_permission
from app.domain.errors import DomainError
from app.domain.ports.audit import AuditPort, AuditRecord
from app.domain.ports.exports import DashboardExportRenderer
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
    def __init__(self, renderer: DashboardExportRenderer, audit: AuditPort) -> None:
        self._renderer = renderer
        self._audit = audit

    async def dashboard(
        self,
        data: dict[str, Any],
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

        body = await self._renderer.render(output_format, data)
        await self._audit.append(
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
        stem = f"consilium-report-{query.date_from.isoformat()}-{query.date_to.isoformat()}"
        filename = (
            f"{re.sub(r'[^\w.-]+', '_', stem, flags=re.UNICODE).strip('._')[:100]}.{output_format}"
        )
        return ExportArtifact(body, filename, _MIME_TYPES[output_format])
