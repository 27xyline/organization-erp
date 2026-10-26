from __future__ import annotations

from io import BytesIO

import httpx
import pytest
from openpyxl import load_workbook

from app.api.dependencies import get_authenticated_context
from app.api.routes.payroll import get_payroll_service
from app.core.context import Actor, RequestContext
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.integrations.payroll_export import OpenpyxlPayrollWorkbook
from app.main import create_app
from app.services.payroll import PayrollService


def _report_row() -> dict[str, object]:
    return {
        "employeeId": f"c{'1' * 24}",
        "code": "EMP-007",
        "fullName": "Иванов Иван",
        "department": "Разработка",
        "position": "Инженер",
        "rate": 1,
        "plannedGross": 125000.5,
        "actualBase": 120000.25,
        "allowance": 5000.25,
        "bonus": 1500,
        "oneTime": 250,
        "deduction": 300,
        "gross": 126750.5,
        "tax": 16478,
        "payable": 110272.5,
        "contributions": 38025.15,
        "employerCost": 164775.65,
        "variance": 1750,
    }


def test_payroll_workbook_matches_legacy_sheet_headers_filters_and_currency() -> None:
    from app.integrations.payroll_export import build_payroll_workbook

    content = build_payroll_workbook(2026, 10, [_report_row()])
    workbook = load_workbook(BytesIO(content), data_only=True)
    sheet = workbook["Платёжная ведомость"]

    assert workbook.properties.creator == "Consilium"
    assert sheet["A1"].value == "Платёжная ведомость"
    assert sheet["A2"].value == "10.2026"
    assert [sheet.cell(3, column).value for column in range(1, 13)] == [
        "Табельный номер",
        "Сотрудник",
        "Подразделение",
        "Должность",
        "Ставка",
        "План",
        "Начислено",
        "НДФЛ",
        "К выплате",
        "Взносы работодателя",
        "Стоимость работодателя",
        "Отклонение",
    ]
    assert sheet.max_column == 12
    assert sheet.freeze_panes == "A4"
    assert sheet.auto_filter.ref == "A3:L3"
    assert sheet["F4"].value == 125000.5
    assert sheet["F4"].number_format == "#,##0.00 [$₽-ru-RU]"
    assert sheet["E4"].number_format == "General"
    assert sheet["A1"].font.bold and sheet["A1"].font.sz == 16
    assert sheet["A3"].fill.fgColor.rgb == "FFE2E8F0"
    assert sheet["A1"].font.name == "Arial"


def test_payroll_payslip_workbook_matches_legacy_layout_and_currency() -> None:
    from app.integrations.payroll_export import build_payslip_workbook

    content = build_payslip_workbook(2026, 10, _report_row())
    workbook = load_workbook(BytesIO(content), data_only=True)
    sheet = workbook["Расчетный лист"]

    assert workbook.properties.creator == "Consilium"
    assert sheet["A1"].value == "РАСЧЕТНЫЙ ЛИСТ"
    assert sheet["A2"].value == "За период: 10.2026"
    assert sheet["A4"].value == "Табельный номер:"
    assert sheet["B4"].value == "EMP-007"
    assert [sheet.cell(row, 1).value for row in range(5, 9)] == [
        "Сотрудник:",
        "Подразделение:",
        "Должность:",
        "Ставка:",
    ]
    assert sheet["A10"].value == "Вид начисления/удержания"
    assert [sheet.cell(row, 1).value for row in range(11, 16)] == [
        "Оклад",
        "Надбавки",
        "Премии",
        "Удержания (НДФЛ)",
        "Прочие удержания",
    ]
    assert [sheet.cell(row, 2).value for row in range(11, 16)] == [125000.5, 0, 0, 0, 0]
    assert [sheet.cell(row, 3).value for row in range(11, 16)] == [
        120000.25,
        5000.25,
        1750,
        -16478,
        -300,
    ]
    assert [sheet.cell(row, 1).value for row in range(17, 21)] == [
        "Всего начислено:",
        "НДФЛ удержан:",
        "К выплате на руки:",
        "Взносы ПФР/ФОМС/ФСС:",
    ]
    assert [sheet.cell(row, 3).value for row in range(17, 21)] == [
        126750.5,
        -16478,
        110272.5,
        38025.15,
    ]
    assert sheet["A19"].value == "К выплате на руки:"
    assert sheet["C19"].value == 110272.5
    assert sheet["B11"].number_format == "#,##0.00 [$₽-ru-RU]"
    assert sheet["C20"].number_format == "#,##0.00 [$₽-ru-RU]"
    assert sheet["A1"].font.name == "Arial"


class _ExportService:
    async def export_month(self, year: int, month: int, context: RequestContext):
        return b"monthly-xlsx", f"payroll-{year}-{month:02d}.xlsx"

    async def export_payslip(
        self, year: int, month: int, employee_id: str, context: RequestContext
    ):
        if employee_id != f"c{'1' * 24}":
            from app.domain.errors import DomainError

            raise DomainError(
                "NOT_FOUND", "Сотрудник не найден в расчетной ведомости за этот месяц", 404
            )
        return b"payslip-xlsx", f"payslip-EMP-007-{year}-{month:02d}.xlsx"


@pytest.mark.anyio
async def test_payroll_export_routes_keep_binary_headers_and_not_found_contract() -> None:
    app = create_app()
    from opentelemetry import trace

    app.state.tracer = trace.get_tracer(__name__)
    access = AccessContext(
        user_id="s10-exporter",
        employee_id=None,
        employee_department_id=None,
        member_project_ids=(),
        grants=(ScopeGrant("s10-grant", "ADMIN", "ALL", "ALL"),),
    )
    context = RequestContext(
        request_id="s10-export-contract",
        actor=Actor(actor_id="s10-exporter", is_authenticated=True, access=access),
    )
    app.dependency_overrides[get_authenticated_context] = lambda: context
    app.dependency_overrides[get_payroll_service] = _ExportService
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        monthly = await client.get("/api/payroll/export?year=2026&month=10")
        payslip = await client.get(
            f"/api/payroll/export-payslip?year=2026&month=10&employeeId=c{'1' * 24}"
        )
        not_found = await client.get(
            f"/api/payroll/export-payslip?year=2026&month=10&employeeId=c{'2' * 24}"
        )

    media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert monthly.status_code == 200
    assert monthly.content == b"monthly-xlsx"
    assert monthly.headers["content-type"] == media_type
    assert monthly.headers["content-disposition"] == 'attachment; filename="payroll-2026-10.xlsx"'
    assert monthly.headers["cache-control"] == "no-store"
    assert payslip.status_code == 200
    assert payslip.content == b"payslip-xlsx"
    assert (
        payslip.headers["content-disposition"]
        == 'attachment; filename="payslip-EMP-007-2026-10.xlsx"'
    )
    assert not_found.status_code == 404
    assert not_found.json()["error"]["code"] == "NOT_FOUND"


@pytest.mark.anyio
async def test_payroll_export_requires_scoped_export_permission_before_uow() -> None:
    service = PayrollService(
        lambda: pytest.fail("UoW must not open without payroll.export"),
        OpenpyxlPayrollWorkbook(),
    )
    access = AccessContext(
        user_id="s10-reader",
        employee_id=None,
        employee_department_id=None,
        member_project_ids=(),
        grants=(ScopeGrant("s10-grant", "VIEWER", "ALL", "ALL"),),
    )
    context = RequestContext(
        request_id="s10-export-denied",
        actor=Actor(actor_id="s10-reader", is_authenticated=True, access=access),
    )

    from app.domain.errors import DomainError

    with pytest.raises(DomainError) as denied:
        await service.export_month(2026, 10, context)

    assert denied.value.status_code == 403
