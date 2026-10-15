from app.schemas.projects import ProjectInput, TaskCreateInput, TaskUpdateInput


def test_kanban_patch_does_not_reset_arrays_or_nullable_dates():
    patch = TaskUpdateInput.model_validate({"status": "IN_PROGRESS"})
    assert patch.model_dump(exclude_unset=True) == {"status": "IN_PROGRESS"}


def test_create_defaults_and_legacy_coercions():
    task = TaskCreateInput.model_validate(
        {"name": " a ", "level": "1", "progress": "", "startDate": " ", "employeeIds": ["x", "x"]}
    )
    assert task.name == " a "
    assert task.progress == 0
    assert task.startDate is None
    assert task.employeeIds == ["x"]
    assert (
        ProjectInput.model_validate({"code": "p", "name": "P", "plannedBudget": ""}).plannedBudget
        == 0
    )
