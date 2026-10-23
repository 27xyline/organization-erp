from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import (
    get_authenticated_context,
    get_payroll_period_service,
    get_payroll_service,
)
from app.core.context import RequestContext
from app.schemas.payroll import PayrollAdjustmentInput, PayrollMonthQuery, PayrollPeriodInput
from app.services.finance_periods import PayrollPeriodService
from app.services.payroll import PayrollService
from app.services.users import json_value

router = APIRouter(prefix="/payroll", tags=["payroll"])
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
