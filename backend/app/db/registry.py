"""Импортирует полный реестр ORM для настройки мапперов и сравнений Alembic.

Схемой DDL управляет Alembic. Импорт этого модуля только регистрирует метаданные
моделей и никогда не создаёт, не изменяет и не удаляет объекты базы данных.
"""

from sqlalchemy.orm import configure_mappers

from app.db.base import Base
from app.models.approvals import ApprovalRequest, ApprovalStep, ApprovalTemplate
from app.models.assets import (
    Asset,
    AssetHolding,
    AssetInventory,
    AssetInventoryEntry,
    AssetMaintenance,
    Operation,
)
from app.models.catalogs import AssetGroup, Mol, Supplier
from app.models.departments import Department
from app.models.documents import Document, DocumentVersion
from app.models.employees import Employee, EmployeeCertificate, EmployeeSkill
from app.models.finance import (
    FinancePlanEntry,
    PayrollAdjustment,
    PayrollPeriod,
    PersonnelAction,
    SalaryEntry,
)
from app.models.notifications import (
    Notification,
    NotificationOutbox,
    NotificationPreference,
    ScheduledAlertRun,
    SmtpSettings,
)
from app.models.procurement import (
    ProcurementContract,
    ProcurementDelivery,
    ProcurementDeliveryItem,
    ProcurementItem,
    ProcurementRequest,
)
from app.models.projects import (
    Project,
    ProjectMember,
    Task,
    TaskAssignee,
    TaskChecklistItem,
    TaskComment,
    TaskDependency,
)
from app.models.reporting import AssetSavedView, ReportPreset
from app.models.sessions import UserSession
from app.models.timekeeping import StaffSchedule, TimeEntry, Timesheet, Vacation
from app.models.users import (
    AuditLog,
    User,
    UserDepartmentScope,
    UserProjectScope,
    UserRoleAssignment,
)

configure_mappers()

__all__ = [
    "ApprovalRequest",
    "ApprovalStep",
    "ApprovalTemplate",
    "Asset",
    "AssetGroup",
    "AssetHolding",
    "AssetInventory",
    "AssetInventoryEntry",
    "AssetMaintenance",
    "AssetSavedView",
    "AuditLog",
    "Base",
    "Department",
    "Document",
    "DocumentVersion",
    "Employee",
    "EmployeeCertificate",
    "EmployeeSkill",
    "FinancePlanEntry",
    "Mol",
    "Notification",
    "NotificationOutbox",
    "NotificationPreference",
    "Operation",
    "PayrollAdjustment",
    "PayrollPeriod",
    "PersonnelAction",
    "ProcurementContract",
    "ProcurementDelivery",
    "ProcurementDeliveryItem",
    "ProcurementItem",
    "ProcurementRequest",
    "Project",
    "ProjectMember",
    "ReportPreset",
    "SalaryEntry",
    "ScheduledAlertRun",
    "SmtpSettings",
    "StaffSchedule",
    "Supplier",
    "Task",
    "TaskAssignee",
    "TaskChecklistItem",
    "TaskComment",
    "TaskDependency",
    "TimeEntry",
    "Timesheet",
    "User",
    "UserSession",
    "UserDepartmentScope",
    "UserProjectScope",
    "UserRoleAssignment",
    "Vacation",
]
