export enum AssetStatus {
  IN_STOCK = 'IN_STOCK',
  IN_USE = 'IN_USE',
  UNDER_REPAIR = 'UNDER_REPAIR',
  PLANNED_FOR_DISPOSAL = 'PLANNED_FOR_DISPOSAL',
  PARTIALLY_DISPOSED = 'PARTIALLY_DISPOSED',
  FULLY_DISPOSED = 'FULLY_DISPOSED',
}

export enum OperationType {
  RECEIPT = 'RECEIPT',
  TRANSFER = 'TRANSFER',
  DISPOSAL = 'DISPOSAL',
  STATUS_CHANGE = 'STATUS_CHANGE',
}

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
export enum ProjectStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
}

export enum TaskStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  DELAYED = 'DELAYED',
}

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
  status: TaskStatus
  projectId: string
  project?: Project
  createdAt: Date
  updatedAt: Date
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