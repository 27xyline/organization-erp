from __future__ import annotations

from app.domain.errors import DomainError


def require_period_open(status: str) -> None:
    if status == "CLOSED":
        raise DomainError("PERIOD_CLOSED", "Расчётный период закрыт", 409)
