from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.timekeeping import (
    TimeEntryDeleteInput,
    TimeEntryInput,
    TimeEntryUpdateInput,
    TimesheetDecisionInput,
)


def test_time_entry_schema_preserves_dates_and_decimal_hours() -> None:
    value = TimeEntryInput.model_validate(
        {
            "employeeId": "c123456789012345678901234",
            "workDate": "2026-02-28",
            "type": "REGULAR",
            "hours": 7.25,
        }
    )

    assert value.workDate == date(2026, 2, 28)
    assert value.hours == Decimal("7.25")


def test_timesheet_return_requires_a_reason() -> None:
    with pytest.raises(ValidationError):
        TimesheetDecisionInput.model_validate({"decision": "RETURN"})


@pytest.mark.parametrize("field", ["employeeId", "workDate", "type", "hours", "correctionReason"])
def test_update_rejects_null_for_non_nullable_legacy_fields(field: str) -> None:
    with pytest.raises(ValidationError):
        TimeEntryUpdateInput.model_validate({field: None})


def test_delete_correction_reason_is_trimmed_and_null_is_rejected() -> None:
    assert (
        TimeEntryDeleteInput.model_validate({"correctionReason": " valid "}).correctionReason
        == "valid"
    )
    with pytest.raises(ValidationError):
        TimeEntryDeleteInput.model_validate({"correctionReason": None})
