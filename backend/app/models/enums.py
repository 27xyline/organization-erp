"""Перечисления Python соответствуют меткам PostgreSQL и порядку их сортировки."""

from enum import StrEnum

from app.domain import enums as domain_enums

ApprovalRequestStatus = domain_enums.ApprovalRequestStatus
ApprovalStepStatus = domain_enums.ApprovalStepStatus
DocumentStatus = domain_enums.DocumentStatus
NotificationChannel = domain_enums.NotificationChannel
NotificationEventType = domain_enums.NotificationEventType
FinancePlanType = domain_enums.FinancePlanType
PayrollAdjustmentType = domain_enums.PayrollAdjustmentType
ProcurementStatus = domain_enums.ProcurementStatus
TimeEntryType = domain_enums.TimeEntryType
TimesheetStatus = domain_enums.TimesheetStatus


class AssetStatus(StrEnum):
    IN_STOCK = "IN_STOCK"
    IN_USE = "IN_USE"
    UNDER_REPAIR = "UNDER_REPAIR"
    PLANNED_FOR_DISPOSAL = "PLANNED_FOR_DISPOSAL"
    PARTIALLY_DISPOSED = "PARTIALLY_DISPOSED"
    FULLY_DISPOSED = "FULLY_DISPOSED"


class AssetInventoryStatus(StrEnum):
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"


class AssetMaintenanceType(StrEnum):
    INSPECTION = "INSPECTION"
    CALIBRATION = "CALIBRATION"
    REPAIR = "REPAIR"
    SERVICE = "SERVICE"


class AssetMaintenanceStatus(StrEnum):
    PLANNED = "PLANNED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELED = "CANCELED"


class OperationType(StrEnum):
    RECEIPT = "RECEIPT"
    TRANSFER = "TRANSFER"
    DISPOSAL = "DISPOSAL"
    STATUS_CHANGE = "STATUS_CHANGE"


class UserRole(StrEnum):
    ADMIN = "ADMIN"
    EDITOR = "EDITOR"
    VIEWER = "VIEWER"


class AppRole(StrEnum):
    ADMIN = "ADMIN"
    HR = "HR"
    ACCOUNTANT = "ACCOUNTANT"
    PROJECT_MANAGER = "PROJECT_MANAGER"
    ASSET_CUSTODIAN = "ASSET_CUSTODIAN"
    DEPARTMENT_HEAD = "DEPARTMENT_HEAD"
    AUDITOR = "AUDITOR"
    EMPLOYEE = "EMPLOYEE"


class ScopeMode(StrEnum):
    NONE = "NONE"
    ALL = "ALL"
    ASSIGNED = "ASSIGNED"
    SELF = "SELF"


class NotificationOutboxStatus(StrEnum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    SENT = "SENT"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


class ProjectStatus(StrEnum):
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    ARCHIVED = "ARCHIVED"


class TaskStatus(StrEnum):
    NOT_STARTED = "NOT_STARTED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    DELAYED = "DELAYED"


class TaskPriority(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class TaskRisk(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class EmployeeStatus(StrEnum):
    ACTIVE = "ACTIVE"
    ON_VACATION = "ON_VACATION"
    ON_SICK_LEAVE = "ON_SICK_LEAVE"
    DISMISSED = "DISMISSED"


class EmploymentContractType(StrEnum):
    PRIMARY = "PRIMARY"
    INTERNAL = "INTERNAL"
    EXTERNAL = "EXTERNAL"


class PayrollPeriodStatus(StrEnum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class PersonnelActionType(StrEnum):
    HIRE = "HIRE"
    DISMISS = "DISMISS"
    TRANSFER = "TRANSFER"
    EXTEND = "EXTEND"
    PROMOTE = "PROMOTE"
    EDIT = "EDIT"
    ARCHIVE = "ARCHIVE"


class VacationType(StrEnum):
    VACATION = "VACATION"
    SICK_LEAVE = "SICK_LEAVE"
    BUSINESS_TRIP = "BUSINESS_TRIP"
    UNPAID_LEAVE = "UNPAID_LEAVE"


class DocumentCategory(StrEnum):
    GENERAL = "GENERAL"
    CONTRACT = "CONTRACT"
    ORDER = "ORDER"
    ACT = "ACT"
    INVOICE = "INVOICE"
    PERSONNEL = "PERSONNEL"
    PROJECT = "PROJECT"
    ASSET = "ASSET"
    OTHER = "OTHER"
