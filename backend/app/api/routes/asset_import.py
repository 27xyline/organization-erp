"""XLSX upload/download adapters; parsing and workbook rendering run off-loop."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile

from app.api.dependencies import get_asset_export_service, get_asset_import_service
from app.api.routes.asset_access import get_asset_context
from app.api.routes.assets import data
from app.core.context import RequestContext
from app.domain.errors import DomainError
from app.schemas.assets import ImportCommitInput
from app.services.asset_export import AssetExportService
from app.services.asset_import import AssetImportError, AssetImportService
from app.services.dto.assets import AssetCommand

router = APIRouter(tags=["asset-import-export"])
ImportService = Annotated[AssetImportService, Depends(get_asset_import_service)]
ExportService = Annotated[AssetExportService, Depends(get_asset_export_service)]
Context = Annotated[RequestContext, Depends(get_asset_context)]
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
MAX_BYTES = 5 * 1024 * 1024


@router.post("/assets/import/preview")
async def preview(request: Request, context: Context, service: ImportService) -> JSONResponse:
    try:
        form = await request.form(max_files=1, max_fields=10, max_part_size=MAX_BYTES)
    except Exception as error:
        raise DomainError(
            "ASSET_IMPORT_FILE_REQUIRED", "Выберите файл Excel для проверки", 422
        ) from error
    upload = form.get("file")
    if not isinstance(upload, UploadFile):
        raise DomainError("ASSET_IMPORT_FILE_REQUIRED", "Выберите файл Excel для проверки", 422)
    try:
        if not (upload.filename or "").lower().endswith(".xlsx"):
            raise DomainError(
                "ASSET_IMPORT_FORMAT_UNSUPPORTED",
                "Поддерживается шаблон Excel в формате .xlsx",
                422,
            )
        if upload.size is not None and upload.size > MAX_BYTES:
            raise DomainError(
                "ASSET_IMPORT_FILE_TOO_LARGE",
                "Файл слишком большой. Максимальный размер — 5 МБ",
                422,
            )
        content = await upload.read(MAX_BYTES + 1)
        if len(content) > MAX_BYTES:
            raise DomainError(
                "ASSET_IMPORT_FILE_TOO_LARGE",
                "Файл слишком большой. Максимальный размер — 5 МБ",
                422,
            )
        try:
            rows = await run_in_threadpool(service.parse_workbook, content)
            result = await service.preview(rows, context)
        except AssetImportError as error:
            raise DomainError("ASSET_IMPORT_INVALID_FILE", str(error), 422) from error
        return data(
            {
                "rows": result,
                "validCount": sum(bool(row.get("input")) and not row["errors"] for row in result),
                "errorCount": sum(bool(row["errors"]) for row in result),
            }
        )
    finally:
        await upload.close()


@router.post("/assets/import/commit")
async def commit(
    input: ImportCommitInput, context: Context, service: ImportService
) -> JSONResponse:
    commands = tuple(AssetCommand(**item.model_dump()) for item in input.assets)
    count = await service.commit(commands, context)
    return data(
        {
            "importedCount": count,
            "inventoryNumbers": [command.inventoryNumber for command in commands],
        },
        201,
    )


@router.get("/assets/import/template")
async def template(context: Context, service: ImportService) -> Response:
    content = await service.template(context)
    return Response(
        content,
        media_type=XLSX_MIME,
        headers={
            "Content-Disposition": 'attachment; filename="asset-import-template.xlsx"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/export")
async def export(request: Request, context: Context, service: ExportService) -> Response:
    assert context.actor is not None
    content, filename = await service.export(
        request.query_params.get("type", "assets"), context.actor, dict(request.query_params)
    )
    return Response(
        content,
        media_type=XLSX_MIME,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
