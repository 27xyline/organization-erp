import { AssetStatus, OperationType } from '@prisma/client'
import type { Project } from '@/features/projects/contracts/types'

export { AssetStatus, OperationType }

export interface Mol {
  id: string
  code: string
  department: string
  fullName: string
  storageLocation: string
  photo?: string | null
  createdAt: Date | string
  updatedAt: Date | string
}

export interface AssetGroup {
  id: string
  name: string
  code: string
  description?: string | null
  createdAt: Date | string
  updatedAt: Date | string
}

export type DecimalValue = number | string

export interface AssetHolding {
  id: string
  assetId: string
  molId: string
  quantity: DecimalValue
  mol: Mol
  createdAt: Date | string
  updatedAt: Date | string
}

export interface Asset {
  id: string
  orderNumber: number
  name: string
  inventoryNumber: string
  unitPrice: DecimalValue
  unitOfMeasure: string
  quantity: DecimalValue
  totalCost: DecimalValue
  molId: string
  mol: Mol
  holdings?: AssetHolding[]
  groupId: string
  group: AssetGroup
  projectId?: string | null
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
  notes?: string | null
  createdAt: Date | string
  updatedAt: Date | string
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
  quantity: DecimalValue
  unitPrice: DecimalValue
  totalCost: DecimalValue
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
