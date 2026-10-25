"Проверка российского идентификационного номера налогоплательщика."


def is_valid_russian_inn(value: str) -> bool:
    if len(value) not in (10, 12) or not value.isascii() or not value.isdigit():
        return False
    digits = [int(char) for char in value]

    def check(coefficients: tuple[int, ...]) -> int:
        relevant = digits[: len(coefficients)]
        return sum(c * d for c, d in zip(coefficients, relevant, strict=True)) % 11 % 10

    if len(digits) == 10:
        return check((2, 4, 10, 3, 5, 9, 4, 6, 8)) == digits[9]
    return (
        check((7, 2, 4, 10, 3, 5, 9, 4, 6, 8)) == digits[10]
        and check((3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8)) == digits[11]
    )
