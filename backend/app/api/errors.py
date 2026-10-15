from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.domain.errors import DomainError

logger = logging.getLogger(__name__)


def _error_response(
    status_code: int,
    code: str,
    message: str,
    details: Any | None = None,
    *,
    request: Request | None = None,
) -> JSONResponse:
    error: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    headers: dict[str, str] = {}
    context = getattr(getattr(request, "state", None), "request_context", None)
    if context is not None:
        headers["x-request-id"] = context.request_id
    return JSONResponse(status_code=status_code, content={"error": error}, headers=headers)


def _validation_details(exc: RequestValidationError) -> list[dict[str, str]]:
    return [
        {
            "location": ".".join(str(part) for part in error.get("loc", ())),
            "type": str(error.get("type", "invalid")),
            "message": str(error.get("msg", "Invalid value")),
        }
        for error in exc.errors()
    ]


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        if request.url.path == "/api/internal/auth/credentials":
            return JSONResponse(
                {"data": None},
                status_code=200,
                headers={"x-request-id": request.state.request_context.request_id},
            )
        if request.url.path.startswith(("/api/projects", "/api/tasks")):
            errors = exc.errors()
            member_path = "/members" in request.url.path
            if member_path:
                first = errors[0] if errors else {}
                location = first.get("loc", ())
                key = str(location[-1]) if location else ""
                message = (
                    "Сотрудник обязателен"
                    if key == "employeeId" and first.get("type") in {"missing", "string_too_short"}
                    else "Required"
                    if first.get("type") == "missing"
                    else "Expected boolean, received null"
                    if key == "isArchived" and first.get("input") is None
                    else str(first.get("msg", "Ошибка валидации данных"))
                )
                return JSONResponse({"error": message}, status_code=400)
            project_fields: dict[str, list[str]] = {}
            for error in errors:
                location = error.get("loc", ())
                key = str(location[1]) if len(location) > 1 else ""
                if key:
                    message = str(error.get("msg", "Invalid value"))
                    if error.get("type") == "value_error" and error.get("input") is None:
                        kind = (
                            "boolean"
                            if key == "isMilestone"
                            else "array"
                            if key in {"employeeIds", "predecessorIds", "checklist"}
                            else "string"
                        )
                        message = f"Expected {kind}, received null"
                    if key == "name" and error.get("type") == "string_too_short":
                        message = (
                            "Название задачи обязательно"
                            if "/tasks" in request.url.path
                            else "Название проекта обязательно"
                        )
                    project_fields.setdefault(key, []).append(message)
            return JSONResponse(
                {
                    "error": {
                        "code": "VALIDATION_ERROR",
                        "message": "Проверьте введённые данные",
                        "fieldErrors": project_fields,
                    }
                },
                status_code=422,
            )
        if request.url.path.startswith("/api/users") or request.url.path == "/api/account/password":
            fields: dict[str, list[str]] = {}
            for error in exc.errors():
                location = error.get("loc", ())
                key = str(location[1]) if len(location) > 1 else ""
                if key:
                    fields.setdefault(key, []).append(str(error.get("msg", "Invalid value")))
            return JSONResponse(
                {
                    "error": {
                        "code": "VALIDATION_ERROR",
                        "message": "Проверьте введённые данные",
                        "fieldErrors": fields,
                    }
                },
                status_code=422,
                headers={"x-request-id": request.state.request_context.request_id},
            )
        if request.url.path.startswith(("/api/departments", "/api/groups", "/api/mols")):
            catalog_fields: dict[str, list[str]] = {}
            for error in exc.errors():
                location = error.get("loc", ())
                key = str(location[-1]) if location else ""
                if key == "body":
                    key = "departmentId"
                if key:
                    catalog_fields.setdefault(key, []).append(
                        str(error.get("msg", "Invalid value"))
                    )
            return JSONResponse(
                {
                    "error": {
                        "code": "VALIDATION_ERROR",
                        "message": "Проверьте введённые данные",
                        "fieldErrors": catalog_fields,
                    }
                },
                status_code=422,
                headers={"x-request-id": request.state.request_context.request_id},
            )
        return _error_response(
            422,
            "validation_error",
            "Request validation failed",
            _validation_details(exc),
            request=request,
        )

    @app.exception_handler(DomainError)
    async def handle_domain_error(request: Request, exc: DomainError) -> JSONResponse:
        message = exc.message
        if (
            request.method == "POST"
            and request.url.path == "/api/users"
            and exc.code
            in {"INVALID_SCOPE_ASSIGNMENT", "INVALID_SCOPE_REFERENCE", "EMPLOYEE_LINK_REQUIRED"}
        ):
            message = "Проверьте роли, области доступа и связь с сотрудником"
        return _error_response(exc.status_code, exc.code, message, exc.details, request=request)

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code, message = {
            400: ("bad_request", "Request could not be processed"),
            401: ("unauthorized", "Authentication is required"),
            403: ("forbidden", "Access is denied"),
            404: ("not_found", "Resource was not found"),
            405: ("method_not_allowed", "Method is not allowed"),
        }.get(exc.status_code, ("http_error", "Request could not be processed"))
        return _error_response(exc.status_code, code, message, request=request)

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        request_id = getattr(
            getattr(request.state, "request_context", None), "request_id", "unknown"
        )
        logger.error(
            "Unhandled request failure request_id=%s exception_type=%s",
            request_id,
            type(exc).__name__,
        )
        return _error_response(
            500, "internal_error", "An unexpected error occurred", request=request
        )
