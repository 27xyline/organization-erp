from app.domain.departments.rules import (
    normalize_department_code,
    normalize_department_name,
    validate_parent_chain,
)
from app.domain.errors import DomainError


def test_normalizes_department_code_and_name() -> None:
    assert normalize_department_code("  hr-01 ") == "HR-01"
    assert normalize_department_name("  Отдел   кадров  ") == "Отдел кадров"


def test_parent_chain_rejects_cycle_to_updated_department() -> None:
    try:
        validate_parent_chain("root", "child", (("child", "root"),))
    except DomainError as error:
        assert error.code == "CYCLIC_HIERARCHY"
    else:
        raise AssertionError("Expected a cyclic hierarchy error")


def test_parent_chain_rejects_existing_cycle_and_missing_parent() -> None:
    for parent_id, chain, expected in (
        ("one", (("one", "two"), ("two", "one")), "CYCLIC_HIERARCHY"),
        ("missing", (), "PARENT_NOT_FOUND"),
    ):
        try:
            validate_parent_chain("new", parent_id, chain)
        except DomainError as error:
            assert error.code == expected
        else:
            raise AssertionError(f"Expected {expected}")
