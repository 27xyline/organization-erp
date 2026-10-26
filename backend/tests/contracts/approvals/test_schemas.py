from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.schemas.approvals import ApprovalCreateInput, ApprovalQueryInput


def test_assigned_to_me_keeps_zod_false_string_coercion():
    assert ApprovalQueryInput.model_validate({"assignedToMe": "false"}).assignedToMe is True


def test_duplicate_approver_is_rejected():
    with pytest.raises(ValidationError, match="Согласующий не должен повторяться"):
        ApprovalCreateInput.model_validate(
            {
                "title": "Документ",
                "steps": [
                    {"approverId": "same", "name": "Первый"},
                    {"approverId": "same", "name": "Второй"},
                ],
            }
        )


def test_due_date_must_be_in_the_future():
    with pytest.raises(ValidationError, match="Срок должен быть в будущем"):
        ApprovalCreateInput.model_validate(
            {
                "title": "Документ",
                "dueAt": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
                "steps": [{"approverId": "one", "name": "Первый"}],
            }
        )
