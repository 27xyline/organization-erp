from app.domain.errors import DomainError

_ALLOWED = {
    "PLANNED": {"PLANNED", "IN_PROGRESS", "CANCELED"},
    "IN_PROGRESS": {"IN_PROGRESS", "COMPLETED", "CANCELED"},
    "COMPLETED": {"COMPLETED"},
    "CANCELED": {"CANCELED"},
}


def ensure_transition(current: str, following: str) -> None:
    if following not in _ALLOWED.get(current, set()):
        raise DomainError("INVALID_TRANSITION", "Недопустимый переход статуса обслуживания", 409)


def restored_status(previous: str | None) -> str:
    return previous if previous and previous != "UNDER_REPAIR" else "IN_USE"
