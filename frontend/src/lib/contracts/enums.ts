/** Значения API клиентской части независимы от схемы ORM базы данных. */
export const AssetStatus = {
  IN_STOCK: 'IN_STOCK',
  IN_USE: 'IN_USE',
  UNDER_REPAIR: 'UNDER_REPAIR',
  PLANNED_FOR_DISPOSAL: 'PLANNED_FOR_DISPOSAL',
  PARTIALLY_DISPOSED: 'PARTIALLY_DISPOSED',
  FULLY_DISPOSED: 'FULLY_DISPOSED',
} as const
export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus]

export const AssetInventoryStatus = { IN_PROGRESS: 'IN_PROGRESS', COMPLETED: 'COMPLETED' } as const
export type AssetInventoryStatus = (typeof AssetInventoryStatus)[keyof typeof AssetInventoryStatus]

export const AssetMaintenanceType = {
  INSPECTION: 'INSPECTION', CALIBRATION: 'CALIBRATION', REPAIR: 'REPAIR', SERVICE: 'SERVICE',
} as const
export type AssetMaintenanceType = (typeof AssetMaintenanceType)[keyof typeof AssetMaintenanceType]

export const AssetMaintenanceStatus = {
  PLANNED: 'PLANNED', IN_PROGRESS: 'IN_PROGRESS', COMPLETED: 'COMPLETED', CANCELED: 'CANCELED',
} as const
export type AssetMaintenanceStatus = (typeof AssetMaintenanceStatus)[keyof typeof AssetMaintenanceStatus]

export const OperationType = {
  RECEIPT: 'RECEIPT', TRANSFER: 'TRANSFER', DISPOSAL: 'DISPOSAL', STATUS_CHANGE: 'STATUS_CHANGE',
} as const
export type OperationType = (typeof OperationType)[keyof typeof OperationType]

export const UserRole = { ADMIN: 'ADMIN', EDITOR: 'EDITOR', VIEWER: 'VIEWER' } as const
export type UserRole = (typeof UserRole)[keyof typeof UserRole]

export const AppRole = {
  ADMIN: 'ADMIN', HR: 'HR', ACCOUNTANT: 'ACCOUNTANT', PROJECT_MANAGER: 'PROJECT_MANAGER',
  ASSET_CUSTODIAN: 'ASSET_CUSTODIAN', DEPARTMENT_HEAD: 'DEPARTMENT_HEAD', AUDITOR: 'AUDITOR', EMPLOYEE: 'EMPLOYEE',
} as const
export type AppRole = (typeof AppRole)[keyof typeof AppRole]

export const ScopeMode = { NONE: 'NONE', ALL: 'ALL', ASSIGNED: 'ASSIGNED', SELF: 'SELF' } as const
export type ScopeMode = (typeof ScopeMode)[keyof typeof ScopeMode]

export const NotificationEventType = {
  SYSTEM: 'SYSTEM', APPROVAL_REQUESTED: 'APPROVAL_REQUESTED', APPROVAL_DECIDED: 'APPROVAL_DECIDED',
  CONTRACT_EXPIRING: 'CONTRACT_EXPIRING', TASK_OVERDUE: 'TASK_OVERDUE', ASSET_DISPOSAL_DUE: 'ASSET_DISPOSAL_DUE',
  ASSET_MAINTENANCE_DUE: 'ASSET_MAINTENANCE_DUE', BUDGET_OVERRUN: 'BUDGET_OVERRUN',
} as const
export type NotificationEventType = (typeof NotificationEventType)[keyof typeof NotificationEventType]

export const NotificationChannel = { IN_APP: 'IN_APP', EMAIL: 'EMAIL' } as const
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel]

export const ApprovalRequestStatus = {
  DRAFT: 'DRAFT', PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED', CANCELLED: 'CANCELLED',
} as const
export type ApprovalRequestStatus = (typeof ApprovalRequestStatus)[keyof typeof ApprovalRequestStatus]

export const ApprovalStepStatus = {
  WAITING: 'WAITING', PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED', SKIPPED: 'SKIPPED',
} as const
export type ApprovalStepStatus = (typeof ApprovalStepStatus)[keyof typeof ApprovalStepStatus]

export const ProjectStatus = { ACTIVE: 'ACTIVE', COMPLETED: 'COMPLETED', ARCHIVED: 'ARCHIVED' } as const
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus]

export const ProcurementStatus = {
  DRAFT: 'DRAFT', SUBMITTED: 'SUBMITTED', APPROVED: 'APPROVED', CONTRACTED: 'CONTRACTED',
  PARTIALLY_DELIVERED: 'PARTIALLY_DELIVERED', DELIVERED: 'DELIVERED', CAPITALIZED: 'CAPITALIZED',
  REJECTED: 'REJECTED', CANCELLED: 'CANCELLED',
} as const
export type ProcurementStatus = (typeof ProcurementStatus)[keyof typeof ProcurementStatus]

export const TaskStatus = { NOT_STARTED: 'NOT_STARTED', IN_PROGRESS: 'IN_PROGRESS', COMPLETED: 'COMPLETED', DELAYED: 'DELAYED' } as const
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus]
export const TaskPriority = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' } as const
export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority]
export const TaskRisk = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' } as const
export type TaskRisk = (typeof TaskRisk)[keyof typeof TaskRisk]

export const EmployeeStatus = {
  ACTIVE: 'ACTIVE', ON_VACATION: 'ON_VACATION', ON_SICK_LEAVE: 'ON_SICK_LEAVE', DISMISSED: 'DISMISSED',
} as const
export type EmployeeStatus = (typeof EmployeeStatus)[keyof typeof EmployeeStatus]

export const TimeEntryType = {
  REGULAR: 'REGULAR', VACATION: 'VACATION', SICK_LEAVE: 'SICK_LEAVE', BUSINESS_TRIP: 'BUSINESS_TRIP', OVERTIME: 'OVERTIME',
} as const
export type TimeEntryType = (typeof TimeEntryType)[keyof typeof TimeEntryType]
export const TimesheetStatus = { DRAFT: 'DRAFT', SUBMITTED: 'SUBMITTED', APPROVED: 'APPROVED', RETURNED: 'RETURNED' } as const
export type TimesheetStatus = (typeof TimesheetStatus)[keyof typeof TimesheetStatus]

export const PayrollAdjustmentType = { BONUS: 'BONUS', ONE_TIME: 'ONE_TIME', DEDUCTION: 'DEDUCTION' } as const
export type PayrollAdjustmentType = (typeof PayrollAdjustmentType)[keyof typeof PayrollAdjustmentType]
export const PayrollPeriodStatus = { OPEN: 'OPEN', CLOSED: 'CLOSED' } as const
export type PayrollPeriodStatus = (typeof PayrollPeriodStatus)[keyof typeof PayrollPeriodStatus]
export const FinancePlanType = { OKLAD: 'OKLAD', NADBAVKA: 'NADBAVKA' } as const
export type FinancePlanType = (typeof FinancePlanType)[keyof typeof FinancePlanType]

export const DocumentStatus = {
  DRAFT: 'DRAFT', IN_REVIEW: 'IN_REVIEW', APPROVED: 'APPROVED', SIGNED: 'SIGNED', ARCHIVED: 'ARCHIVED',
} as const
export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus]
export const DocumentCategory = {
  GENERAL: 'GENERAL', CONTRACT: 'CONTRACT', ORDER: 'ORDER', ACT: 'ACT', INVOICE: 'INVOICE',
  PERSONNEL: 'PERSONNEL', PROJECT: 'PROJECT', ASSET: 'ASSET', OTHER: 'OTHER',
} as const
export type DocumentCategory = (typeof DocumentCategory)[keyof typeof DocumentCategory]
