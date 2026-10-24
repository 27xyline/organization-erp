from app.domain.procurement.inn import is_valid_russian_inn


def test_validates_russian_ten_and_twelve_digit_inn_checksums() -> None:
    assert is_valid_russian_inn("7707083893")
    assert is_valid_russian_inn("500100732259")
    assert not is_valid_russian_inn("7701234567")
    assert not is_valid_russian_inn("500100732250")
    assert not is_valid_russian_inn("123")
