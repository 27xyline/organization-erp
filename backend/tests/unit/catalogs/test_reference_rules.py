from app.domain.catalogs.rules import normalize_department_reference
from app.domain.errors import DomainError


def test_department_id_takes_precedence_over_legacy_name() -> None:
    assert normalize_department_reference(" dep-1 ", "Legacy") == ("dep-1", None)


def test_department_reference_rejects_blank_values() -> None:
    try:
        normalize_department_reference(None, "  ")
    except DomainError as error:
        assert error.code == "DEPARTMENT_REQUIRED"
    else:
        raise AssertionError("Expected a required department error")
