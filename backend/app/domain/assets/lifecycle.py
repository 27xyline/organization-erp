from decimal import Decimal

from app.domain.errors import DomainError


def remaining_quantity(available: Decimal, requested: Decimal) -> Decimal:
    if requested <= 0:
        raise DomainError("VALIDATION_ERROR", "Количество должно быть больше нуля", 422)
    if requested > available:
        raise DomainError("INSUFFICIENT_QUANTITY", "Недостаточный остаток", 422)
    return available - requested


def ensure_transfer_destination(source: str, destination: str | None) -> None:
    if not destination or source == destination:
        raise DomainError("VALIDATION_ERROR", "Получатель должен отличаться от отправителя", 422)
