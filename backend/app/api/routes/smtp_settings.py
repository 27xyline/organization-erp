"""Administrative SMTP settings and out-of-transaction connection probe."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.api.dependencies import get_authenticated_context
from app.core.context import RequestContext
from app.schemas.notifications import SmtpSettingsInput
from app.services.smtp_settings import SmtpSettingsService
from app.services.users import authorize

router = APIRouter(prefix="/notifications/smtp", tags=["smtp-settings"])
Context = Annotated[RequestContext, Depends(get_authenticated_context)]


def service(request: Request) -> SmtpSettingsService:
    return SmtpSettingsService(
        request.app.state.unit_of_work_factory, request.app.state.smtp_verifier
    )


Service = Annotated[SmtpSettingsService, Depends(service)]


def parse_error(error: ValidationError) -> JSONResponse:
    return JSONResponse(
        {"error": {"code": "BAD_REQUEST", "message": "Неверный формат настроек"}}, status_code=400
    )


def assert_admin(context: RequestContext) -> None:
    assert context.actor is not None
    authorize(context.actor, "access.users.update")


@router.get("")
async def get_settings(context: Context, service: Service) -> Any:
    assert_admin(context)
    return {"data": await service.get()}


@router.post("")
async def save_settings(request: Request, context: Context, service: Service) -> Any:
    assert_admin(context)
    try:
        parsed = SmtpSettingsInput.model_validate(await request.json())
    except (ValidationError, ValueError, UnicodeError) as error:
        return (
            parse_error(error)
            if isinstance(error, ValidationError)
            else JSONResponse(
                {"error": {"code": "BAD_REQUEST", "message": "Неверный формат настроек"}},
                status_code=400,
            )
        )
    return {"data": await service.save(parsed.model_dump())}


@router.post("/test")
async def test_settings(request: Request, context: Context, service: Service) -> Any:
    assert_admin(context)
    try:
        parsed = SmtpSettingsInput.model_validate(await request.json())
    except (ValidationError, ValueError, UnicodeError) as error:
        return (
            parse_error(error)
            if isinstance(error, ValidationError)
            else JSONResponse(
                {"error": {"code": "BAD_REQUEST", "message": "Неверный формат настроек"}},
                status_code=400,
            )
        )
    return {"data": {"success": await service.test(parsed.model_dump())}}
