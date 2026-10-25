"Проверка профиля, не зависящая от HTTP и хранения данных."

from datetime import datetime

from app.domain.errors import DomainError


def validate_skill_names(names: tuple[str, ...]) -> None:
    normalized = tuple(name.strip().lower() for name in names)
    if len(set(normalized)) != len(normalized):
        raise DomainError("VALIDATION_ERROR", "Навык указан повторно", 422)


def validate_certificate_dates(issued: datetime | None, expires: datetime | None) -> None:
    if issued and expires and expires < issued:
        raise DomainError("VALIDATION_ERROR", "Срок действия не может быть раньше даты выдачи", 422)
