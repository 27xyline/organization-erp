from datetime import datetime
from decimal import Decimal

import pytest

from app.domain.employees.employment import validate_contract_dates, validate_employment_rate
from app.domain.errors import DomainError


def test_equal_contract_dates_are_rejected_despite_permissive_db_check():
    with pytest.raises(DomainError) as error:
        validate_contract_dates(datetime(2026, 1, 1), datetime(2026, 1, 1))
    assert error.value.code == "INVALID_CONTRACT_DATE_RANGE"


@pytest.mark.parametrize("rate", ["0", "-1", "NaN", "Infinity"])
def test_invalid_rates(rate):
    with pytest.raises(DomainError) as error:
        validate_employment_rate(Decimal(rate))
    assert error.value.code == "INVALID_EMPLOYMENT_RATE"


def test_fractional_and_multiple_rates_remain_allowed():
    validate_employment_rate(Decimal("0.25"))
    validate_employment_rate(Decimal("2"))


@pytest.mark.parametrize("value,expected", [(0.125, "0.13"), (2.675, "2.67"), (0.005, "0.01")])
def test_project_salary_rounding_matches_binary_number_to_fixed(value, expected):
    from app.domain.employees.employment import fixed_money

    assert fixed_money(value) == expected
