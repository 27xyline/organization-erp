import pytest
from pydantic import ValidationError

from app.schemas.catalogs import GroupInput, MolInput


def test_group_input_allows_nullable_description_and_ignores_unknown_fields():
    value = GroupInput.model_validate(
        {"name": "Furniture", "code": "F", "description": None, "ignored": True}
    )
    assert value.description is None
    assert "ignored" not in value.model_dump()


def test_mol_requires_department_id_or_legacy_department_name():
    with pytest.raises(ValidationError):
        MolInput.model_validate({"code": "M", "fullName": "Person", "storageLocation": "Room"})
    value = MolInput.model_validate(
        {"code": "M", "department": " A ", "fullName": "Person", "storageLocation": "Room"}
    )
    assert value.department == "A"
