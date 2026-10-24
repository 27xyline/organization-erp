from datetime import date
from typing import Any

import pytest

from app.domain.auth.rules import AccessContext, ScopeGrant
from app.domain.ports.audit import AuditRecord
from app.services.dto.reporting import DashboardQuery, ReportPresetInput
from app.services.exports import ExportService
from app.services.my_actions import MyActionsService
from app.services.reporting import ReportingService
from app.services.search import SearchService


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
async def test_search_service_normalizes_and_delegates_to_port() -> None:
    class SearchPort:
        async def search(self, query: str, access: AccessContext) -> list[dict[str, str]]:
            assert query == "needle"
            assert access is _admin_context
            return [{"id": "1", "type": "project", "title": "Needle"}]

    _admin_context = _admin()
    assert await SearchService(SearchPort()).search("  needle  ", _admin_context) == [
        {"id": "1", "type": "project", "title": "Needle"}
    ]


@pytest.mark.anyio
async def test_my_actions_service_delegates_to_port() -> None:
    expected = {"tasks": [{"id": "task-1"}]}

    class MyActionsPort:
        async def my_actions(
            self,
            actor_id: str,
            employee_id: str | None,
            access: AccessContext,
            now: Any,
        ) -> dict[str, Any]:
            assert actor_id == "actor-1"
            assert employee_id == "employee-1"
            assert access is _admin_context
            assert now == fixed_now
            return expected

    from datetime import datetime

    _admin_context = _admin()
    fixed_now = datetime(2026, 10, 24)
    assert await MyActionsService(MyActionsPort()).get_for_user(
        "actor-1", "employee-1", _admin_context, fixed_now
    ) == expected


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
    service = ExportService(renderer, audit)
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
