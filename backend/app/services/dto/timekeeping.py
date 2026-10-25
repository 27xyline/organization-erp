"""Framework-neutral commands accepted by timekeeping use cases."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any, Literal, Protocol

TimeEntryKind = Literal["REGULAR", "VACATION", "SICK_LEAVE", "BUSINESS_TRIP", "OVERTIME"]
TimesheetDecision = Literal["APPROVE", "RETURN"]


class TimeEntryCommand(Protocol):
    employeeId: str
    projectId: str | None
    taskId: str | None
    workDate: date
    type: TimeEntryKind
    hours: Decimal
    note: str | None
    correctionReason: str | None


@dataclass(frozen=True, slots=True)
class TimeEntryUpdateCommand:
    values: dict[str, Any]
    correctionReason: str | None = None


class SubmitTimesheetCommand(Protocol):
    employeeId: str
    year: int
    month: int
    zeroHoursConfirmed: bool


class TimesheetDecisionCommand(Protocol):
    decision: TimesheetDecision
    reason: str | None
