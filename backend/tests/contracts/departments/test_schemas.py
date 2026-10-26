import pytest
from pydantic import ValidationError

from app.schemas.departments import DepartmentCreateInput, DepartmentUpdateInput


def test_department_create_normalizes_nothing_but_defaults_nullable_fields_and_active():
    value = DepartmentCreateInput.model_validate({"code": " hr ", "name": " Unit "})
    assert value.code == "hr"
    assert value.name == "Unit"
    assert value.parent_id is None
    assert value.head_employee_id is None
    assert value.is_active is True


def test_department_update_preserves_missing_fields_and_explicit_nulls():
    omitted = DepartmentUpdateInput.model_validate({"name": "Renamed"})
    cleared = DepartmentUpdateInput.model_validate({"parentId": None, "headEmployeeId": None})
    assert omitted.model_fields_set == {"name"}
    assert cleared.model_fields_set == {"parent_id", "head_employee_id"}


def test_department_update_rejects_empty_and_null_nonnullable_fields():
    for body in ({}, {"code": None}, {"isActive": None}):
        with pytest.raises(ValidationError):
            DepartmentUpdateInput.model_validate(body)


def test_department_create_drops_unknown_properties_like_zod_object():
    value = DepartmentCreateInput.model_validate(
        {"code": "A", "name": "B", "unexpected": "discard"}
    )
    assert "unexpected" not in value.model_dump()
    assert (
        DepartmentCreateInput.model_validate({"code": "A", "name": "B", "parentId": ""}).parent_id
        is None
    )


def test_department_update_rejects_only_unknown_properties_and_transforms_empty_ids():
    with pytest.raises(ValidationError):
        DepartmentUpdateInput.model_validate({"unexpected": True})
    assert DepartmentUpdateInput.model_validate({"parentId": ""}).parent_id is None
