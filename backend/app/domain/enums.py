"Значения рабочих процессов, общие для сервисов и хранения данных и не зависящие от фреймворка."

from enum import StrEnum


class NotificationEventType(StrEnum):
    SYSTEM = "SYSTEM"
    CONTRACT_EXPIRING = "CONTRACT_EXPIRING"
    TASK_OVERDUE = "TASK_OVERDUE"
    ASSET_DISPOSAL_DUE = "ASSET_DISPOSAL_DUE"
    BUDGET_OVERRUN = "BUDGET_OVERRUN"
    APPROVAL_REQUESTED = "APPROVAL_REQUESTED"
    APPROVAL_DECIDED = "APPROVAL_DECIDED"
    ASSET_MAINTENANCE_DUE = "ASSET_MAINTENANCE_DUE"


class NotificationChannel(StrEnum):
    IN_APP = "IN_APP"
    EMAIL = "EMAIL"


class ApprovalRequestStatus(StrEnum):
    DRAFT = "DRAFT"
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class ApprovalStepStatus(StrEnum):
    WAITING = "WAITING"
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    SKIPPED = "SKIPPED"


class DocumentStatus(StrEnum):
    DRAFT = "DRAFT"
    IN_REVIEW = "IN_REVIEW"
    APPROVED = "APPROVED"
    SIGNED = "SIGNED"
    ARCHIVED = "ARCHIVED"


class ProcurementStatus(StrEnum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    CONTRACTED = "CONTRACTED"
    PARTIALLY_DELIVERED = "PARTIALLY_DELIVERED"
    DELIVERED = "DELIVERED"
    CAPITALIZED = "CAPITALIZED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class TimeEntryType(StrEnum):
    REGULAR = "REGULAR"
    VACATION = "VACATION"
    SICK_LEAVE = "SICK_LEAVE"
    BUSINESS_TRIP = "BUSINESS_TRIP"
    OVERTIME = "OVERTIME"


class TimesheetStatus(StrEnum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    RETURNED = "RETURNED"


class PayrollAdjustmentType(StrEnum):
    BONUS = "BONUS"
    ONE_TIME = "ONE_TIME"
    DEDUCTION = "DEDUCTION"


class FinancePlanType(StrEnum):
    OKLAD = "OKLAD"
    NADBAVKA = "NADBAVKA"
