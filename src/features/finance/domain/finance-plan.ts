import { FinancePlanType, type Prisma } from '@prisma/client'
import { ServiceError } from '@/lib/errors/service-error'

export type FinancePlanRouteType = 'oklad' | 'nadbavka'

type FinanceEntryWithProject = {
  amount: Prisma.Decimal | number
  projectId: string | null
  project?: { id: string; code: string; name: string } | null
}

type RawFinanceAllocation = { projectId?: string; amount?: string }
export type NormalizedFinanceAllocation = { projectId: string; amount: string }

export type FinancePlanErrorCode =
  | 'INVALID_FINANCE_PLAN_TYPE'
  | 'INVALID_EMPLOYEE_SELECTION'
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_REQUIRED'
  | 'INVALID_OKLAD_AMOUNT'
  | 'INVALID_FINANCE_AMOUNT'
  | 'INVALID_ALLOCATIONS'

export const financePlanError = (code: FinancePlanErrorCode) => new ServiceError(code)
export const getCurrentYear = () => new Date().getFullYear()

export const getPlanType = (value: string | null | undefined) => {
  if (value === 'oklad') return FinancePlanType.OKLAD
  if (value === 'nadbavka') return FinancePlanType.NADBAVKA
  return null
}

export const getNormalizedAmount = (value: unknown) => {
  if (typeof value !== 'string') return null
  const normalized = value.replace(',', '.').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const numericValue = Number(normalized)
  if (Number.isNaN(numericValue) || numericValue <= 0) return null
  return numericValue.toFixed(2)
}

export const formatProjectBudget = (project: {
  id: string
  code: string
  name: string
  plannedBudget: Prisma.Decimal | number
  actualBudget: Prisma.Decimal | number
}) => ({
  id: project.id,
  code: project.code,
  name: project.name,
  plannedBudget: Number(project.plannedBudget).toFixed(2),
  actualBudget: Number(project.actualBudget).toFixed(2),
  remainingBudget: (Number(project.plannedBudget) - Number(project.actualBudget)).toFixed(2),
})

export const buildCellPayload = (entries: FinanceEntryWithProject[]) => {
  const allocations = entries
    .filter((entry) => entry.projectId)
    .map((entry) => ({
      projectId: entry.projectId as string,
      projectCode: entry.project?.code || '',
      projectName: entry.project?.name || '',
      amount: Number(entry.amount).toFixed(2),
    }))
    .sort((left, right) => left.projectCode.localeCompare(right.projectCode, 'ru', { sensitivity: 'base' }))
  const totalAmount = allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0)
  const projectCodes = Array.from(new Set(allocations.map((allocation) => allocation.projectCode).filter(Boolean)))
  const singleAllocation = allocations.length === 1 ? allocations[0] : null
  return {
    amount: totalAmount.toFixed(2),
    projectId: singleAllocation?.projectId || null,
    projectCode: singleAllocation?.projectCode || '',
    projectName: singleAllocation?.projectName || '',
    projectLabel: projectCodes.join(', '),
    allocations,
  }
}

export const buildNormalizedAllocations = ({
  type, employeeSalary, employeeRate, projectId, rawAllocations,
}: {
  type: FinancePlanType
  employeeSalary: Prisma.Decimal | number | null | undefined
  employeeRate: Prisma.Decimal | number | null | undefined
  projectId?: string
  rawAllocations?: RawFinanceAllocation[]
}): NormalizedFinanceAllocation[] => {
  if (type === FinancePlanType.OKLAD) {
    if (!projectId) throw financePlanError('PROJECT_REQUIRED')
    const amount = (Number(employeeSalary ?? 0) * Number(employeeRate ?? 0)).toFixed(2)
    if (Number(amount) <= 0) throw financePlanError('INVALID_OKLAD_AMOUNT')
    return [{ projectId, amount }]
  }
  if (!rawAllocations?.length) throw financePlanError('INVALID_ALLOCATIONS')
  const allocationMap = new Map<string, number>()
  for (const allocation of rawAllocations) {
    if (!allocation.projectId) throw financePlanError('PROJECT_REQUIRED')
    const normalizedAmount = getNormalizedAmount(allocation.amount)
    if (!normalizedAmount) throw financePlanError('INVALID_FINANCE_AMOUNT')
    allocationMap.set(allocation.projectId, (allocationMap.get(allocation.projectId) || 0) + Number(normalizedAmount))
  }
  return Array.from(allocationMap.entries()).map(([nextProjectId, amount]) => ({
    projectId: nextProjectId,
    amount: amount.toFixed(2),
  }))
}

export const calculateBudgetAdjustments = (
  existingEntries: Array<{ projectId: string | null; amount: Prisma.Decimal | number }>,
  nextAllocations: NormalizedFinanceAllocation[],
) => {
  const decrements = new Map<string, string>()
  const increments = new Map<string, string>()
  existingEntries.forEach((entry) => {
    if (!entry.projectId) return
    decrements.set(entry.projectId, (Number(decrements.get(entry.projectId) || '0') + Number(entry.amount)).toFixed(2))
  })
  nextAllocations.forEach((allocation) => {
    increments.set(allocation.projectId, (Number(increments.get(allocation.projectId) || '0') + Number(allocation.amount)).toFixed(2))
  })
  return { decrements, increments }
}
