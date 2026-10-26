"Чистые правила и стабильные переводы ошибок для переходов согласования."

from datetime import UTC, datetime
from typing import NoReturn

from app.domain.errors import DomainError

ERRORS = {
    "NOT_FOUND": ("Согласование не найдено", 404),
    "FORBIDDEN": ("Недостаточно прав для этого согласования", 403),
    "INVALID_STATE": ("Согласование уже завершено или изменилось", 409),
    "INVALID_APPROVER": ("Один из согласующих недоступен", 422),
    "REFERENCE_NOT_FOUND": ("Связанный объект не найден", 422),
    "TEMPLATE_EXISTS": ("Шаблон с таким названием уже существует", 409),
    "TEMPLATE_NOT_FOUND": ("Шаблон маршрута не найден", 404),
}


def fail(code: str) -> NoReturn:
    message, status = ERRORS[code]
    legacy_code = {
        "NOT_FOUND": "APPROVAL_NOT_FOUND",
        "INVALID_STATE": "INVALID_APPROVAL_STATE",
        "TEMPLATE_NOT_FOUND": "APPROVAL_TEMPLATE_NOT_FOUND",
    }.get(code, code)
    raise DomainError(legacy_code, message, status)


def utc_naive(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value.astimezone(UTC).replace(tzinfo=None)
    return value


def validate_deadline(value: datetime | None, now: datetime) -> None:
    if value is not None:
        if utc_naive(value) <= utc_naive(now):
            raise DomainError("VALIDATION_ERROR", "Срок должен быть в будущем", 422)
