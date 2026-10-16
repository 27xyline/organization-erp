"""Validate legacy query aliases without silently coercing invalid booleans."""

from fastapi import Request
from pydantic import ValidationError

from app.domain.errors import DomainError
from app.schemas.assets import AssetListFilters
from app.services.dto.assets import AssetQuery


def page_query(request: Request, *, default_size: int = 25) -> tuple[int, int]:
    try:
        page = int(request.query_params.get("page", "1"))
        size = int(
            request.query_params.get(
                "pageSize", request.query_params.get("limit", str(default_size))
            )
        )
        if page < 1 or not 1 <= size <= 100:
            raise ValueError
        return page, size
    except ValueError as error:
        raise DomainError("VALIDATION_ERROR", "Проверьте введённые данные", 422) from error


def asset_query(request: Request) -> AssetQuery:
    page, size = page_query(request)
    raw = dict(request.query_params)
    archived = raw.get("archived", raw.get("isArchived", "false"))
    if archived not in {"true", "false"}:
        raise DomainError("VALIDATION_ERROR", "Проверьте введённые данные", 422)
    allowed = {key: value for key, value in raw.items() if key in AssetListFilters.model_fields}
    try:
        filters = AssetListFilters.model_validate(allowed)
    except ValidationError as error:
        raise DomainError("VALIDATION_ERROR", "Проверьте введённые данные", 422) from error
    return AssetQuery(page, size, **filters.model_dump(), archived=archived == "true")
