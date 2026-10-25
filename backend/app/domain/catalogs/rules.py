"Чистые правила для ссылок на справочники."

from app.domain.errors import DomainError


def normalize_department_reference(
    department_id: str | None, department_name: str | None
) -> tuple[str | None, str | None]:
    normalized_id = department_id.strip() if department_id else None
    normalized_name = department_name.strip() if department_name else None
    if not normalized_id and not normalized_name:
        raise DomainError("DEPARTMENT_REQUIRED", "Подразделение обязательно", 422)
    if normalized_id:
        return normalized_id, None
    return None, normalized_name
