"Чистые правила прежнего HR-домена; ставки намеренно не ограничиваются единицей."

from datetime import UTC, datetime
from decimal import Decimal

from app.domain.errors import DomainError

ERRORS = {
    "EMPLOYEE_NOT_FOUND": ("Сотрудник не найден", 404),
    "POSITION_REQUIRED": ("Должность из штатного расписания обязательна", 400),
    "POSITION_NOT_FOUND": ("Должность из штатного расписания не найдена", 404),
    "INVALID_EMPLOYMENT_RATE": ("Количество ставок сотрудника должно быть больше нуля", 400),
    "INSUFFICIENT_POSITION_RATE": ("Недостаточно свободных ставок по выбранной должности", 400),
    "INACTIVE_POSITION_DEPARTMENT": ("Подразделение выбранной должности неактивно", 409),
    "INVALID_CONTRACT_DATE": ("Некорректная дата договора", 400),
    "INVALID_CONTRACT_DATE_RANGE": (
        "Дата подписания договора должна быть раньше срока действия договора",
        400,
    ),
    "INVALID_ACTION_DATE": ("Некорректная дата кадрового действия", 400),
    "INVALID_HIRE_PAYLOAD": ("Отсутствуют обязательные поля для приема на работу", 400),
    "MISSING_EMPLOYEE_ID": ("Сотрудник обязателен для этого действия", 400),
    "MISSING_CONTRACT_END_DATE": ("Новая дата окончания контракта обязательна", 400),
}


def hr_error(code: str) -> DomainError:
    message, status = ERRORS[code]
    return DomainError(code, message, status)


def parse_date(
    value: str | datetime | None, *, optional: bool = False, code: str = "INVALID_CONTRACT_DATE"
) -> datetime | None:
    if optional and (value is None or value == ""):
        return None
    try:
        result = (
            value
            if isinstance(value, datetime)
            else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        )
        return result.astimezone(UTC).replace(tzinfo=None) if result.tzinfo else result
    except (ValueError, TypeError):
        raise hr_error(code) from None


def validate_employment_rate(rate: Decimal) -> None:
    if not rate.is_finite() or rate <= 0:
        raise hr_error("INVALID_EMPLOYMENT_RATE")


def validate_contract_dates(signed: datetime | None, end: datetime | None) -> None:
    if signed is not None and end is not None and signed >= end:
        raise hr_error("INVALID_CONTRACT_DATE_RANGE")


def fixed_money(value: float) -> str:
    "Повторяет Number.toFixed(2), включая двоичное умножение и обработку равных значений."
    from decimal import ROUND_HALF_UP

    return format(
        Decimal.from_float(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP), ".2f"
    )
