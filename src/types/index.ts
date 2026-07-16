import { AssetStatus, OperationType, ProjectStatus, TaskStatus } from '@prisma/client'
export { AssetStatus, OperationType, ProjectStatus, TaskStatus }

export interface Mol {
  id: string
  code: string
  department: string
  fullName: string
  storageLocation: string
  createdAt: Date
  updatedAt: Date
}

export interface AssetGroup {
  id: string
  name: string
  code: string
  description?: string | null
  createdAt: Date
  updatedAt: Date
}

export interface Asset {
  id: string
  orderNumber: number
  name: string
  inventoryNumber: string
  unitPrice: number
  unitOfMeasure: string
  quantity: number
  totalCost: number
  molId: string
  mol: Mol
  groupId: string
  group: AssetGroup
  projectId?: string
  project?: Project
  contractCode?: string
  internalFundingCode?: string
  isExistingAsset: boolean
  recordingDate: Date
  documentType: string
  documentDetails: string
  documentFiles: string[]
  status: AssetStatus
  isArchived: boolean
  plannedDisposalDate?: Date
  plannedDisposalReason?: string
  accountingForm?: string
  photos?: string[]
  notes?: string
  createdAt: Date
  updatedAt: Date
  operations?: Operation[]
}

export interface Operation {
  id: string
  type: OperationType
  assetId: string
  asset: Asset
  fromMolId?: string
  fromMol?: Mol
  toMolId?: string
  toMol?: Mol
  quantity: number
  unitPrice: number
  totalCost: number
  date: Date
  reason?: string
  documentType: string
  documentDetails: string
  documentFiles: string[]
  oldStatus?: AssetStatus
  newStatus?: AssetStatus
  createdAt: Date
}

export const AssetStatusLabels: Record<AssetStatus, string> = {
  [AssetStatus.IN_STOCK]: 'В наличии',
  [AssetStatus.IN_USE]: 'В эксплуатации',
  [AssetStatus.UNDER_REPAIR]: 'На ремонте',
  [AssetStatus.PLANNED_FOR_DISPOSAL]: 'К списанию',
  [AssetStatus.PARTIALLY_DISPOSED]: 'Частично списан',
  [AssetStatus.FULLY_DISPOSED]: 'Полностью списан',
}

export const OperationTypeLabels: Record<OperationType, string> = {
  [OperationType.RECEIPT]: 'Приход',
  [OperationType.TRANSFER]: 'Передача',
  [OperationType.DISPOSAL]: 'Списание',
  [OperationType.STATUS_CHANGE]: 'Изменение статуса',
}

// Projects

export interface Project {
  id: string
  code: string
  name: string
  description?: string
  goals?: string
  tasks?: string
  results?: string
  startDate?: Date
  endDate?: Date
  status: ProjectStatus
  plannedBudget: number
  actualBudget: number
  assets?: Asset[]
  tasksList?: Task[]
  createdAt: Date
  updatedAt: Date
}

export interface Task {
  id: string
  name: string
  level: number // 1, 2, or 3
  parentId?: string | null
  parent?: Task | null
  children?: Task[]
  startDate?: Date | null
  endDate?: Date | null
  duration?: number | null // in days
  progress: number // 0-100%
  responsible?: string | null
  assignees: TaskAssignee[]
  status: TaskStatus
  projectId: string
  project?: Project
  createdAt: Date
  updatedAt: Date
}

export interface TaskAssignee {
  employeeId: string
  fullName: string
  projectMemberId?: string | null
}

export const ProjectStatusLabels: Record<ProjectStatus, string> = {
  [ProjectStatus.ACTIVE]: 'Активный',
  [ProjectStatus.COMPLETED]: 'Завершен',
  [ProjectStatus.ARCHIVED]: 'Архив',
}

export const TaskStatusLabels: Record<TaskStatus, string> = {
  [TaskStatus.NOT_STARTED]: 'Не начата',
  [TaskStatus.IN_PROGRESS]: 'В работе',
  [TaskStatus.COMPLETED]: 'Завершена',
  [TaskStatus.DELAYED]: 'Просрочена',
}

// Employees
export type EmployeeStatus = 'ACTIVE' | 'ON_VACATION' | 'ON_SICK_LEAVE' | 'DISMISSED'
export type EmploymentContractType = 'PRIMARY' | 'INTERNAL' | 'EXTERNAL'
export type VacationType = 'VACATION' | 'SICK_LEAVE' | 'BUSINESS_TRIP' | 'UNPAID_LEAVE'
export type PersonnelActionType = 'HIRE' | 'DISMISS' | 'TRANSFER' | 'EXTEND' | 'PROMOTE' | 'ARCHIVE' | 'EDIT'

export interface Employee {
  id: string
  code: string
  fullName: string
  department: string
  phone?: string
  email?: string
  photo?: string
  contractType: EmploymentContractType
  contractSignedDate?: Date | null
  contractEndDate?: Date | null
  contractNumber?: string | null
  status: EmployeeStatus
  staffScheduleId?: string | null
  employmentRate: number
  staffSchedule?: {
    id: string
    position: string
    department: string
    rate: number
    salary: number
  } | null
}

export interface StaffSchedule {
  id: string
  position: string
  department: string
  rate: number
  salary: number
  occupiedRate: number
  freeRate: number
  employees: Employee[]
}

export interface Vacation {
  id: string
  employeeId: string
  employee?: {
    id: string
    fullName: string
    department?: string
  }
  startDate: Date
  endDate: Date
  type: VacationType
}

export interface PersonnelAction {
  id: string
  type: PersonnelActionType
  date: Date
  createdAt: Date
  description?: string | null
  isSynthetic?: boolean
  employeeId: string
  employee: {
    id: string
    fullName: string
    department: string
    status: EmployeeStatus
    contractType: EmploymentContractType
    contractSignedDate?: Date | null
    contractEndDate?: Date | null
    contractNumber?: string | null
    staffScheduleId?: string | null
    employmentRate: number
    staffSchedule?: {
      id: string
      position: string
      department: string
    } | null
  }
  oldDepartment?: string | null
  newDepartment?: string | null
  oldPosition?: string | null
  newPosition?: string | null
  oldContractEndDate?: Date | null
  newContractEndDate?: Date | null
}

export const employeeStatusLabels: Record<EmployeeStatus, string> = {
  ACTIVE: 'Работает',
  ON_VACATION: 'В отпуске',
  ON_SICK_LEAVE: 'На больничном',
  DISMISSED: 'Уволен',
}

export const vacationTypeLabels: Record<VacationType, string> = {
  VACATION: 'Отпуск',
  SICK_LEAVE: 'Больничный',
  BUSINESS_TRIP: 'Командировка',
  UNPAID_LEAVE: 'Без содержания',
}

export const employmentContractTypeLabels: Record<EmploymentContractType, string> = {
  PRIMARY: 'Основной',
  INTERNAL: 'Внутренний',
  EXTERNAL: 'Внешний',
}

export const personnelActionLabels: Record<PersonnelActionType, string> = {
  HIRE: 'Прием',
  DISMISS: 'Увольнение',
  TRANSFER: 'Перевод',
  EXTEND: 'Продление',
  PROMOTE: 'Повышение',
  ARCHIVE: 'Архив',
  EDIT: 'Редактирование',
}
