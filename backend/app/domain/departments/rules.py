"""Pure department input normalization and hierarchy checks."""

from app.domain.errors import DomainError


def normalize_department_code(value: str) -> str:
    return value.strip().upper()


def normalize_department_name(value: str) -> str:
    return " ".join(value.split())


def validate_parent_chain(
    department_id: str | None,
    parent_id: str | None,
    parents: tuple[tuple[str, str | None], ...],
) -> None:
    if not parent_id:
        return
    links = dict(parents)
    visited: set[str] = set()
    cursor: str | None = parent_id
    while cursor:
        if cursor == department_id or cursor in visited:
            raise DomainError(
                "CYCLIC_HIERARCHY", "Нельзя создать циклическую структуру подразделений", 409
            )
        visited.add(cursor)
        if cursor not in links:
            raise DomainError("PARENT_NOT_FOUND", "Родительское подразделение не найдено", 422)
        cursor = links[cursor]
