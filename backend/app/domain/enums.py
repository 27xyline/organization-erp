"""Framework-independent workflow values shared by services and persistence."""

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
