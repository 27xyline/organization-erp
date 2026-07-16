import { FinancePlanType, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ServiceError } from '@/lib/services/service-error'
import { FinancePlanDeleteInput, FinancePlanSaveInput } from '@/lib/schemas/finance-plan'

export type FinancePlanRouteType = 'oklad' | 'nadbavka'

type FinanceEntryWithProject = {
  amount: Prisma.Decimal | number
  projectId: string | null
  project?: { id: string; code: string; name: string } | null
}

type RawFinanceAllocation = {
  projectId?: string
  amount?: string
}

type NormalizedFinanceAllocation = {
  projectId: string
  amount: string
}

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

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null
  }

  const numericValue = Number(normalized)

  if (Number.isNaN(numericValue) || numericValue <= 0) {
    return null
  }

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
  type,
  employeeSalary,
  employeeRate,
  projectId,
  rawAllocations,
}: {
  type: FinancePlanType
  employeeSalary: Prisma.Decimal | number | null | undefined
  employeeRate: Prisma.Decimal | number | null | undefined
  projectId?: string
  rawAllocations?: RawFinanceAllocation[]
}): NormalizedFinanceAllocation[] => {
  if (type === FinancePlanType.OKLAD) {
    if (!projectId) {
      throw financePlanError('PROJECT_REQUIRED')
    }

    const amount = (Number(employeeSalary ?? 0) * Number(employeeRate ?? 0)).toFixed(2)

    if (Number(amount) <= 0) {
      throw financePlanError('INVALID_OKLAD_AMOUNT')
    }

    return [{ projectId, amount }]
  }

  if (!rawAllocations || rawAllocations.length === 0) {
    throw financePlanError('INVALID_ALLOCATIONS')
  }

  const allocationMap = new Map<string, number>()

  for (const allocation of rawAllocations) {
    if (!allocation.projectId) {
      throw financePlanError('PROJECT_REQUIRED')
    }

    const normalizedAmount = getNormalizedAmount(allocation.amount)

    if (!normalizedAmount) {
      throw financePlanError('INVALID_FINANCE_AMOUNT')
    }

    allocationMap.set(
      allocation.projectId,
      (allocationMap.get(allocation.projectId) || 0) + Number(normalizedAmount)
    )
  }

  return Array.from(allocationMap.entries()).map(([nextProjectId, amount]) => ({
    projectId: nextProjectId,
    amount: amount.toFixed(2),
  }))
}

export const calculateBudgetAdjustments = (
  existingEntries: Array<{ projectId: string | null; amount: Prisma.Decimal | number }>,
  nextAllocations: NormalizedFinanceAllocation[]
) => {
  const decrements = new Map<string, string>()
  const increments = new Map<string, string>()

  existingEntries.forEach((entry) => {
    if (!entry.projectId) return

    const currentAmount = Number(decrements.get(entry.projectId) || '0')
    decrements.set(entry.projectId, (currentAmount + Number(entry.amount)).toFixed(2))
  })

  nextAllocations.forEach((allocation) => {
    const currentAmount = Number(increments.get(allocation.projectId) || '0')
    increments.set(allocation.projectId, (currentAmount + Number(allocation.amount)).toFixed(2))
  })

  return { decrements, increments }
}

const getProjectsForFinance = async (includedProjectIds: string[] = []) => {
  const projects = await prisma.project.findMany({
    where: includedProjectIds.length > 0
      ? {
          OR: [
            {
              status: 'ACTIVE',
            },
            {
              id: {
                in: includedProjectIds,
              },
            },
          ],
        }
      : {
          status: 'ACTIVE',
        },
    orderBy: {
      code: 'asc',
    },
    select: {
      id: true,
      code: true,
      name: true,
      plannedBudget: true,
      actualBudget: true,
    },
  })

  return projects.map(formatProjectBudget)
}

export const getFinancePlanErrorMeta = (error: unknown) => {
  if (!(error instanceof ServiceError)) {
    return null
  }

  switch (error.code) {
    case 'INVALID_EMPLOYEE_SELECTION':
      return { status: 400, error: 'Employee is no longer available for planning' }
    case 'PROJECT_NOT_FOUND':
      return { status: 404, error: 'Project not found' }
    case 'PROJECT_REQUIRED':
      return { status: 400, error: 'Выберите проект' }
    case 'INVALID_OKLAD_AMOUNT':
      return { status: 400, error: 'Для сотрудника не задан оклад' }
    case 'INVALID_FINANCE_AMOUNT':
      return { status: 400, error: 'Введите сумму больше нуля' }
    case 'INVALID_ALLOCATIONS':
      return { status: 400, error: 'Добавьте хотя бы одно начисление' }
    default:
      return null
  }
}

export class FinancePlanService {
  static async getTable(type: FinancePlanType, year: number) {
    const employees = await prisma.employee.findMany({
      where: {
        status: {
          not: 'DISMISSED',
        },
      },
      orderBy: {
        fullName: 'asc',
      },
      include: {
        staffSchedule: {
          select: {
            id: true,
            position: true,
            department: true,
            rate: true,
            salary: true,
          },
        },
      },
    })

    const employeeIds = employees.map((employee) => employee.id)

    const entries = employeeIds.length > 0
      ? await prisma.financePlanEntry.findMany({
          where: {
            year,
            type,
            projectId: {
              not: null,
            },
            employeeId: {
              in: employeeIds,
            },
          },
          include: {
            project: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        })
      : []

    const projects = await getProjectsForFinance(
      Array.from(new Set(entries.map((entry) => entry.projectId).filter((value): value is string => Boolean(value))))
    )

    const entryGroups = entries.reduce((groups, entry) => {
      const key = `${entry.employeeId}:${entry.month}`
      const currentEntries = groups.get(key) || []
      currentEntries.push(entry)
      groups.set(key, currentEntries)
      return groups
    }, new Map<string, typeof entries>())

    const rows = employees.map((employee) => ({
      employeeId: employee.id,
      fullName: employee.fullName,
      department: employee.staffSchedule?.department || employee.department || '—',
      position: employee.staffSchedule?.position || '—',
      rate: Number(employee.employmentRate ?? 0).toFixed(2),
      salary: employee.staffSchedule
        ? (Number(employee.staffSchedule.salary) * Number(employee.employmentRate ?? 0)).toFixed(2)
        : '0.00',
      months: Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => {
          const month = index + 1
          return [
            String(month),
            buildCellPayload(entryGroups.get(`${employee.id}:${month}`) || []),
          ]
        })
      ),
    })).sort((left, right) => {
      const departmentCompare = left.department.localeCompare(right.department, 'ru', { sensitivity: 'base' })

      if (departmentCompare !== 0) {
        return departmentCompare
      }

      return left.fullName.localeCompare(right.fullName, 'ru', { sensitivity: 'base' })
    })

    return {
      year,
      rows,
      projects,
    }
  }

  static async saveCell(input: FinancePlanSaveInput) {
    const type = getPlanType(input.type)

    if (!type) {
      throw financePlanError('INVALID_FINANCE_PLAN_TYPE')
    }

    return prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: {
          id: input.employeeId,
          status: {
            not: 'DISMISSED',
          },
        },
        include: {
          staffSchedule: {
            select: {
              salary: true,
            },
          },
        },
      })

      if (!employee) {
        throw financePlanError('INVALID_EMPLOYEE_SELECTION')
      }

      const normalizedAllocations = buildNormalizedAllocations({
        type,
        employeeSalary: employee.staffSchedule?.salary,
        employeeRate: employee.employmentRate,
        projectId: input.projectId,
        rawAllocations: input.allocations,
      })

      const projectIds = Array.from(new Set(normalizedAllocations.map((allocation) => allocation.projectId)))

      const projects = await tx.project.findMany({
        where: {
          id: {
            in: projectIds,
          },
        },
        select: {
          id: true,
          code: true,
          name: true,
          plannedBudget: true,
          actualBudget: true,
        },
      })

      if (projects.length !== projectIds.length) {
        throw financePlanError('PROJECT_NOT_FOUND')
      }

      const existingEntries = await tx.financePlanEntry.findMany({
        where: {
          employeeId: input.employeeId,
          year: input.year,
          month: input.month,
          type,
        },
      })

      const adjustments = calculateBudgetAdjustments(existingEntries, normalizedAllocations)

      for (const [projectId, amount] of Array.from(adjustments.decrements.entries())) {
        await tx.project.update({
          where: { id: projectId },
          data: {
            actualBudget: {
              decrement: new Prisma.Decimal(amount),
            },
          },
        })
      }

      await tx.financePlanEntry.deleteMany({
        where: {
          employeeId: input.employeeId,
          year: input.year,
          month: input.month,
          type,
        },
      })

      await tx.financePlanEntry.createMany({
        data: normalizedAllocations.map((allocation) => ({
          employeeId: input.employeeId,
          year: input.year,
          month: input.month,
          type,
          projectId: allocation.projectId,
          amount: new Prisma.Decimal(allocation.amount),
        })),
      })

      for (const [projectId, amount] of Array.from(adjustments.increments.entries())) {
        await tx.project.update({
          where: { id: projectId },
          data: {
            actualBudget: {
              increment: new Prisma.Decimal(amount),
            },
          },
        })
      }

      const createdEntries = await tx.financePlanEntry.findMany({
        where: {
          employeeId: input.employeeId,
          year: input.year,
          month: input.month,
          type,
        },
        include: {
          project: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      })

      const updatedProjects = await tx.project.findMany({
        where: {
          id: {
            in: projectIds,
          },
        },
        select: {
          id: true,
          code: true,
          name: true,
          plannedBudget: true,
          actualBudget: true,
        },
      })

      return {
        cell: buildCellPayload(createdEntries),
        projects: updatedProjects.map(formatProjectBudget),
      }
    })
  }

  static async clearCell(input: FinancePlanDeleteInput) {
    const type = getPlanType(input.type)

    if (!type) {
      throw financePlanError('INVALID_FINANCE_PLAN_TYPE')
    }

    await prisma.$transaction(async (tx) => {
      const existingEntries = await tx.financePlanEntry.findMany({
        where: {
          employeeId: input.employeeId,
          year: input.year,
          month: input.month,
          type,
        },
      })

      if (existingEntries.length === 0) {
        return
      }

      const adjustments = calculateBudgetAdjustments(existingEntries, [])

      for (const [projectId, amount] of Array.from(adjustments.decrements.entries())) {
        await tx.project.update({
          where: { id: projectId },
          data: {
            actualBudget: {
              decrement: new Prisma.Decimal(amount),
            },
          },
        })
      }

      await tx.financePlanEntry.deleteMany({
        where: {
          employeeId: input.employeeId,
          year: input.year,
          month: input.month,
          type,
        },
      })
    })
  }
}
