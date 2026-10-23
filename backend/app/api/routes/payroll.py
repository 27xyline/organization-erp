from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends

from app.api.dependencies import get_authenticated_context, get_payroll_period_service
from app.core.context import RequestContext
from app.schemas.finance import PayrollPeriodInput
from app.services.finance_periods import PayrollPeriodService
from app.services.users import json_value

router = APIRouter(prefix="/payroll", tags=["payroll"])
Context = Annotated[RequestContext, Depends(get_authenticated_context)]
Service = Annotated[PayrollPeriodService, Depends(get_payroll_period_service)]


@router.put("/period")
async def set_period_status(value: PayrollPeriodInput, context: Context, service: Service) -> Any:
    result = await service.set_status(value.year, value.month, value.status, context, value.reason)
    return {"data": json_value(result)}
