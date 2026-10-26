from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response

from app.api.dependencies import (
    get_authenticated_context,
    get_payroll_period_service,
    get_payroll_service,
)
from app.core.context import RequestContext
from app.schemas.payroll import (
    PayrollAdjustmentInput,
    PayrollMonthQuery,
    PayrollPayslipQuery,
    PayrollPeriodInput,
)
from app.services.finance_periods import PayrollPeriodService
from app.services.payroll import PayrollService
from app.services.users import json_value

router = APIRouter(prefix="/payroll", tags=["payroll"])
_XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
Context = Annotated[RequestContext, Depends(get_authenticated_context)]
Service = Annotated[PayrollPeriodService, Depends(get_payroll_period_service)]
Payroll = Annotated[PayrollService, Depends(get_payroll_service)]


@router.get("")
async def get_payroll_month(
    context: Context,
    service: Payroll,
    year: str = Query(...),
    month: str = Query(...),
) -> Any:
    query = PayrollMonthQuery(year=year, month=month)
    return {"data": json_value(await service.get_month(query.year, query.month, context))}


@router.get("/export")
async def export_payroll_month(
    context: Context,
    service: Payroll,
    year: str = Query(...),
    month: str = Query(...),
) -> Response:
    query = PayrollMonthQuery(year=year, month=month)
    content, filename = await service.export_month(query.year, query.month, context)
    return Response(
        content,
        media_type=_XLSX_MEDIA_TYPE,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/export-payslip")
async def export_payroll_payslip(
    context: Context,
    service: Payroll,
    year: str = Query(...),
    month: str = Query(...),
    employee_id: str = Query(..., alias="employeeId"),
) -> Response:
    query = PayrollPayslipQuery(year=year, month=month, employeeId=employee_id)
    content, filename = await service.export_payslip(
        query.year, query.month, query.employeeId, context
    )
    return Response(
        content,
        media_type=_XLSX_MEDIA_TYPE,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.post("", status_code=201)
async def create_adjustment(
    value: PayrollAdjustmentInput, context: Context, service: Payroll
) -> Any:
    result = await service.create_adjustment(value.model_dump(), context)
    return {"data": json_value(result)}


@router.delete("/adjustments/{adjustment_id}")
async def delete_adjustment(adjustment_id: str, context: Context, service: Payroll) -> Any:
    await service.remove_adjustment(adjustment_id, context)
    return {"data": {"success": True}}


@router.put("/period")
async def set_period_status(value: PayrollPeriodInput, context: Context, service: Service) -> Any:
    result = await service.set_status(value.year, value.month, value.status, context, value.reason)
    return {"data": json_value(result)}
