from datetime import date
from typing import Any

import pytest

from app.domain.auth.rules import AccessContext, ScopeGrant
from app.domain.ports.audit import AuditRecord
from app.services.dto.reporting import DashboardQuery, ReportPresetInput
from app.services.exports import ExportService
from app.services.reporting import ReportingService


class _Repository:
    def __init__(self) -> None:
        self.saved: dict[str, Any] | None = None

    async def save_preset(self, user_id: str, body: dict[str, Any]) -> dict[str, Any]:
        self.saved = {"user_id": user_id, **body}
        return self.saved


class _Renderer:
    def __init__(self) -> None:
        self.format: str | None = None
        self.data: dict[str, Any] | None = None

    async def render(self, output_format: str, data: dict[str, Any]) -> bytes:
        self.format, self.data = output_format, data
        return b"rendered"


class _Audit:
    def __init__(self) -> None:
        self.record: AuditRecord | None = None

    async def append(self, record: AuditRecord) -> None:
        self.record = record


def _admin() -> AccessContext:
    return AccessContext("user-1", None, None, (), (ScopeGrant("admin", "ADMIN", "ALL", "ALL"),))


@pytest.mark.anyio
async def test_reporting_service_uses_dataclass_preset_input_and_repository_port() -> None:
    repository = _Repository()
    service = ReportingService(repository)  # type: ignore[arg-type]

    await service.save_preset(
        "user-1",
        ReportPresetInput("ФОТ", ("plannedFot",), "department", {"year": 2026}),
        _admin(),
    )

    assert repository.saved == {
        "user_id": "user-1",
        "name": "ФОТ",
        "metrics": ["plannedFot"],
        "groupBy": "department",
        "filters": {"year": 2026},
    }


@pytest.mark.anyio
async def test_export_service_uses_renderer_and_audit_ports() -> None:
    renderer, audit = _Renderer(), _Audit()
    service = ExportService(renderer, audit)  # type: ignore[arg-type]
    report = {"summary": {"headcount": 4}}

    artifact = await service.dashboard(
        report,
        DashboardQuery(date(2026, 1, 1), date(2026, 12, 31)),
        _admin(),
        "docx",
        user_id="user-1",
    )

    assert renderer.format == "docx"
    assert renderer.data is report
    assert artifact.body == b"rendered"
    assert artifact.filename.endswith(".docx")
    assert audit.record is not None
    assert audit.record.action == "REPORT_EXPORT"
    assert audit.record.details == {"format": "DOCX", "departmentId": None, "projectId": None}
