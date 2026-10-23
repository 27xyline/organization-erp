"""Raw streaming transport for the existing document HTTP matrix."""

import base64
import json
import re
from dataclasses import asdict
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ValidationError
from starlette.types import Receive, Scope, Send

from app.api.dependencies import get_authenticated_context
from app.core.context import RequestContext
from app.domain.documents.access import access_for
from app.domain.documents.records import DocumentOptions, DocumentRecord
from app.domain.errors import DomainError
from app.schemas.documents import (
    ArchiveInput,
    DocumentInput,
    GenerateInput,
    QueryInput,
    StatusInput,
    VersionInput,
    document_values,
)
from app.services.assets import asset_json
from app.services.documents import DocumentService
from app.services.dto.documents import (
    DocumentCommand,
    DocumentQuery,
    Download,
    GenerateCommand,
    Upload,
    VersionCommand,
)


class DocumentStreamingResponse(StreamingResponse):
    """Close the verified snapshot on success, send failure, or client cancellation."""

    def __init__(self, download: Download, headers: dict[str, str]) -> None:
        self._download = download
        super().__init__(download.chunks(), media_type=download.mime_type, headers=headers)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        try:
            await super().__call__(scope, receive, send)
        finally:
            self._download.file.close()


router = APIRouter(prefix="/documents", tags=["documents"])


async def document_context(
    request: Request, context: Annotated[RequestContext, Depends(get_authenticated_context)]
) -> RequestContext:
    permission = "documents.read"
    if request.url.path.endswith("/download"):
        permission = "documents.download"
    elif request.url.path.endswith("/archive"):
        permission = "documents.archive"
    elif request.url.path.endswith("/versions") or request.method == "PATCH":
        permission = "documents.update"
    elif request.method == "POST" or request.url.path.endswith("/options"):
        permission = "documents.create"
    assert context.actor is not None
    access_for(context.actor, permission)
    return context


Context = Annotated[RequestContext, Depends(document_context)]


def service(request: Request) -> DocumentService:
    return DocumentService(
        request.app.state.unit_of_work_factory,
        request.app.state.document_storage,
        request.app.state.document_rendering,
        request.app.state.settings.document_max_file_size_bytes,
    )


Service = Annotated[DocumentService, Depends(service)]


class DocumentValidation(Exception):
    def __init__(self, fields: dict[str, list[str]]) -> None:
        self.fields = fields


def parse[T: BaseModel](schema: type[T], value: object) -> T:
    try:
        return schema.model_validate(value)
    except ValidationError as error:
        fields: dict[str, list[str]] = {}
        for item in error.errors():
            if not item["loc"]:
                continue
            name = str(item["loc"][0])
            kind = item["type"]
            message = str(item["msg"])
            if kind == "missing":
                message = "Invalid date" if name == "date" else "Required"
            elif kind == "string_too_short":
                limit = item.get("ctx", {}).get("min_length", 1)
                message = f"String must contain at least {limit} character(s)"
            elif kind == "string_too_long":
                limit = item.get("ctx", {}).get("max_length")
                message = f"String must contain at most {limit} character(s)"
            elif kind == "string_type":
                message = "Expected string, received " + (
                    "null"
                    if item.get("input") is None
                    else "boolean"
                    if isinstance(item.get("input"), bool)
                    else "number"
                    if isinstance(item.get("input"), (int, float))
                    else "object"
                )
            elif kind == "greater_than":
                message = "Number must be greater than 0"
            elif kind == "greater_than_equal":
                message = f"Number must be greater than or equal to {item.get('ctx', {}).get('ge')}"
            elif kind == "less_than_equal":
                message = f"Number must be less than or equal to {item.get('ctx', {}).get('le')}"
            elif kind == "int_from_float":
                message = "Expected integer, received float"
            elif kind.startswith("datetime"):
                message = "Invalid date"
            elif kind == "value_error":
                message = message.removeprefix("Value error, ")
            fields.setdefault(name, []).append(message)
        raise DocumentValidation(fields) from None


async def body(request: Request, *, generated: bool = False) -> object:
    try:
        return await request.json()
    except (json.JSONDecodeError, UnicodeError):
        if generated:
            raise DomainError("internal_error", "An unexpected error occurred", 500) from None
        raise DomainError(
            "INVALID_METADATA", "Тело запроса должно содержать корректный JSON", 422
        ) from None


def metadata[T: BaseModel](request: Request, schema: type[T]) -> T:
    encoded = request.headers.get("x-document-metadata")
    if not encoded:
        raise DomainError("MISSING_METADATA", "Не переданы сведения о документе", 422)
    if len(encoded) > 12000:
        raise DomainError("INVALID_METADATA", "Сведения о документе слишком большие", 422)
    try:
        value = json.loads(
            base64.urlsafe_b64decode(encoded + "=" * ((-len(encoded)) % 4)).decode("utf-8")
        )
    except (ValueError, UnicodeError):
        raise DomainError(
            "INVALID_METADATA", "Не удалось прочитать сведения о документе", 422
        ) from None
    return parse(schema, value)


def upload(request: Request) -> Upload:
    raw = request.headers.get("content-length")
    declared = None
    if raw:
        try:
            number = float(raw)
            if not number.is_integer() or number < 0 or number > 9007199254740991:
                raise ValueError
            declared = int(number)
        except ValueError:
            raise DomainError("INVALID_CONTENT_LENGTH", "Некорректный размер файла", 422) from None
    return Upload(request.stream(), request.headers.get("content-type"), declared)


def data(value: DocumentRecord | DocumentOptions, status: int = 200) -> JSONResponse:
    mapped = document_values(value) if isinstance(value, DocumentRecord) else asdict(value)
    return JSONResponse({"data": asset_json(mapped)}, status_code=status)


@router.get("")
async def list_documents(request: Request, context: Context, service: Service) -> JSONResponse:
    query = parse(QueryInput, dict(request.query_params))
    values = query.model_dump()
    values["archived"] = query.archived == "true"
    assert context.actor is not None
    result = await service.list(DocumentQuery(**values), context.actor)
    return JSONResponse(
        {
            "data": asset_json([document_values(row) for row in result.documents]),
            "pagination": {
                "page": query.page,
                "pageSize": query.pageSize,
                "total": result.total,
                "totalPages": max(1, (result.total + query.pageSize - 1) // query.pageSize),
            },
        }
    )


@router.post("")
async def create_document(request: Request, context: Context, service: Service) -> JSONResponse:
    command = DocumentCommand(**metadata(request, DocumentInput).model_dump())
    return data((await service.create(command, upload(request), context)), 201)


@router.get("/options")
async def options(context: Context, service: Service) -> JSONResponse:
    assert context.actor is not None
    return data(await service.options(context.actor))


@router.post("/generate")
async def generate(request: Request, context: Context, service: Service) -> JSONResponse:
    command = GenerateCommand(
        **parse(GenerateInput, await body(request, generated=True)).model_dump()
    )
    return data((await service.generate(command, context)), 201)


@router.get("/{document_id}")
async def get_document(document_id: str, context: Context, service: Service) -> JSONResponse:
    assert context.actor is not None
    return data(await service.get(document_id, context.actor))


@router.patch("/{document_id}")
async def status(
    document_id: str, request: Request, context: Context, service: Service
) -> JSONResponse:
    command = parse(StatusInput, await body(request))
    return data(
        await service.change_status(document_id, command.status, command.lockVersion, context)
    )


@router.post("/{document_id}/versions")
async def version(
    document_id: str, request: Request, context: Context, service: Service
) -> JSONResponse:
    command = VersionCommand(**metadata(request, VersionInput).model_dump())
    return data((await service.add_version(document_id, command, upload(request), context)), 201)


@router.post("/{document_id}/archive")
async def archive(
    document_id: str, request: Request, context: Context, service: Service
) -> JSONResponse:
    command = parse(ArchiveInput, await body(request))
    return data(await service.archive(document_id, command.lockVersion, context))


@router.get("/{document_id}/download")
async def download(
    document_id: str, request: Request, context: Context, service: Service
) -> StreamingResponse:
    number = None
    if "version" in request.query_params:
        # Same coerced positive integer policy as the source query schema.
        try:
            raw = float(request.query_params["version"])
            if not raw.is_integer() or raw <= 0:
                raise ValueError
            number = int(raw)
        except ValueError:
            raise DocumentValidation({"version": ["Number must be greater than 0"]}) from None
    result = await service.download(document_id, number, context)
    fallback = (
        re.sub(r"[^\x20-\x7e]", "_", result.filename).replace("\\", "_").replace('"', "_")[:120]
        or "document"
    )
    encoded_name = quote(result.filename, safe="~()*!'")
    disposition = f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{encoded_name}"
    return DocumentStreamingResponse(
        result,
        headers={
            "cache-control": "private, no-store",
            "content-disposition": disposition,
            "content-length": str(result.size),
            "content-type": result.mime_type,
            "etag": f'"sha256-{result.sha256}"',
            "x-content-type-options": "nosniff",
            "x-request-id": context.request_id,
        },
    )
