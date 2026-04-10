import { FinancePlanType, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ServiceError } from '@/lib/services/service-error'
import {
  calculateBudgetAdjustments,
  getCurrentYear,
  getNormalizedAmount,
} from '@/lib/services/finance-plan.service'
import {
  ProjectPayrollDeleteInput,
  ProjectPayrollSaveInput,
} from '@/lib/schemas/project-payroll'

type ProjectPayrollEntry = {
  type: FinancePlanType
  amount: Prisma.Decimal | number | string
}

type ProjectPayrollCell = {
  amount: string
  projectId: string | null
  projectCode: string
  projectName: string
  projectLabel?: string
  details: Array<{
    type: 'OKLAD' | 'NADBAVKA'
    typeLabel: string
    amount: string
  }>
}

export type ProjectPayrollErrorCode =
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_MEMBER_NOT_FOUND'
  | 'INVALID_NADBAVKA_AMOUNT'
  | 'INVALID_OKLAD_AMOUNT'

export const projectPayrollError = (code: ProjectPayrollErrorCode) => new ServiceError(code)

const typeLabelMap: Record<FinancePlanType, string> = {
  [FinancePlanType.OKLAD]: 'Оклад',
  [FinancePlanType.NADBAVKA]: 'Надбавка',
}

const buildProjectPayrollCell = (entries: ProjectPayrollEntry[]): ProjectPayrollCell => {
  const details = entries
    .map((entry) => ({
      type: entry.type,
      typeLabel: typeLabelMap[entry.type],
      projectCode: '',
      amount: Number(entry.amount).toFixed(2),
    }))
    .sort((left, right) => left.typeLabel.localeCompare(right.typeLabel, 'ru', { sensitivity: 'base' }))

  const totalAmount = details.reduce((sum, detail) => sum + Number(detail.amount), 0)

  return {
    amount: totalAmount.toFixed(2),
    projectId: null,
    projectCode: '',
    projectName: '',
    projectLabel: '',
    details,
  }
}

const emptyProjectPayrollCell = () => buildProjectPayrollCell([])

const mapRow = (member: {
  employeeId: string
  department: string
  position: string
  rate: Prisma.Decimal | number
  salary: Prisma.Decimal | number
  employee: {
    fullName: string
  }
}, entryGroups: Map<string, ProjectPayrollEntry[]>) => ({
  employeeId: member.employeeId,
  fullName: member.employee.fullName,
  department: member.department,
  position: member.position,
  rate: Number(member.rate).toFixed(2),
  salary: Number(member.salary).toFixed(2),
  months: Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => {
      const month = index + 1

      return [
        String(month),
        buildProjectPayrollCell(entryGroups.get(`${member.employeeId}:${month}`) || []),
      ]
    })
  ),
})

export const getProjectPayrollErrorMeta = (error: unknown) => {
  if (!(error instanceof ServiceError)) {
    return null
  }

  switch (error.code) {
    case 'PROJECT_NOT_FOUND':
      return { status: 404, error: 'Проект не найден' }
    case 'PROJECT_MEMBER_NOT_FOUND':
      return { status: 404, error: 'Сотрудник не найден в составе проекта' }
    case 'INVALID_NADBAVKA_AMOUNT':
      return { status: 400, error: 'Введите корректную сумму надбавки' }
    case 'INVALID_OKLAD_AMOUNT':
      return { status: 400, error: 'Для сотрудника не задан оклад в составе проекта' }
    default:
      return null
  }
}

export class ProjectPayrollService {
  static async getTable(projectId: string, year: number = getCurrentYear()) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        code: true,
        name: true,
      },
    })

    if (!project) {
      throw projectPayrollError('PROJECT_NOT_FOUND')
    }

    const members = await prisma.projectMember.findMany({
      where: {
        projectId,
        isArchived: false,
      },
      include: {
        employee: {
          select: {
            fullName: true,
          },
        },
      },
      orderBy: [
        { department: 'asc' },
        { employee: { fullName: 'asc' } },
      ],
    })

    const employeeIds = members.map((member) => member.employeeId)
    const entries = employeeIds.length > 0
      ? await prisma.financePlanEntry.findMany({
          where: {
            year,
            projectId,
            employeeId: {
              in: employeeIds,
            },
            type: {
              in: [FinancePlanType.OKLAD, FinancePlanType.NADBAVKA],
            },
          },
          select: {
            employeeId: true,
            month: true,
            type: true,
            amount: true,
          },
        })
      : []

    const entryGroups = entries.reduce((groups, entry) => {
      const key = `${entry.employeeId}:${entry.month}`
      const current = groups.get(key) || []
      current.push({
        type: entry.type,
        amount: entry.amount,
      })
      groups.set(key, current)
      return groups
    }, new Map<string, ProjectPayrollEntry[]>())

    const rows = members.map((member) => mapRow(member, entryGroups))

    return {
      year,
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
      },
      rows,
      summary: {
        totalRate: rows.reduce((sum, row) => sum + Number(row.rate), 0).toFixed(2),
        totalSalary: rows.reduce((sum, row) => sum + Number(row.salary), 0).toFixed(2),
        monthTotals: Object.fromEntries(
          Array.from({ length: 12 }, (_, index) => {
            const month = String(index + 1)
            const total = rows.reduce((sum, row) => sum + Number(row.months[month]?.amount || 0), 0)
            return [month, total.toFixed(2)]
          })
        ),
      },
    }
  }

  static async saveCell(projectId: string, input: ProjectPayrollSaveInput) {
    return prisma.$transaction(async (tx) => {
      const member = await tx.projectMember.findFirst({
        where: {
          projectId,
          employeeId: input.employeeId,
          isArchived: false,
        },
        select: {
          id: true,
          salary: true,
        },
      })

      if (!member) {
        throw projectPayrollError('PROJECT_MEMBER_NOT_FOUND')
      }

      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
        },
      })

      if (!project) {
        throw projectPayrollError('PROJECT_NOT_FOUND')
      }

      const nextEntries: Array<{ type: FinancePlanType; amount: string }> = []

      if (input.okladEnabled) {
        const okladAmount = Number(member.salary).toFixed(2)

        if (Number(okladAmount) <= 0) {
          throw projectPayrollError('INVALID_OKLAD_AMOUNT')
        }

        nextEntries.push({
          type: FinancePlanType.OKLAD,
          amount: okladAmount,
        })
      }

      if (input.nadbavkaAmount && input.nadbavkaAmount.trim() !== '') {
        const normalizedNadbavkaAmount = getNormalizedAmount(input.nadbavkaAmount)

        if (!normalizedNadbavkaAmount) {
          throw projectPayrollError('INVALID_NADBAVKA_AMOUNT')
        }

        nextEntries.push({
          type: FinancePlanType.NADBAVKA,
          amount: normalizedNadbavkaAmount,
        })
      }

      const existingEntries = await tx.financePlanEntry.findMany({
        where: {
          employeeId: input.employeeId,
          projectId,
          year: input.year,
          month: input.month,
          type: {
            in: [FinancePlanType.OKLAD, FinancePlanType.NADBAVKA],
          },
        },
      })

      const adjustments = calculateBudgetAdjustments(
        existingEntries,
        nextEntries.map((entry) => ({
          projectId,
          amount: entry.amount,
        }))
      )

      for (const [nextProjectId, amount] of Array.from(adjustments.decrements.entries())) {
        await tx.project.update({
          where: { id: nextProjectId },
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
          projectId,
          year: input.year,
          month: input.month,
          type: {
            in: [FinancePlanType.OKLAD, FinancePlanType.NADBAVKA],
          },
        },
      })

      if (nextEntries.length > 0) {
        await tx.financePlanEntry.createMany({
          data: nextEntries.map((entry) => ({
            employeeId: input.employeeId,
            projectId,
            year: input.year,
            month: input.month,
            type: entry.type,
            amount: new Prisma.Decimal(entry.amount),
          })),
        })
      }

      for (const [nextProjectId, amount] of Array.from(adjustments.increments.entries())) {
        await tx.project.update({
          where: { id: nextProjectId },
          data: {
            actualBudget: {
              increment: new Prisma.Decimal(amount),
            },
          },
        })
      }

      return {
        cell: buildProjectPayrollCell(nextEntries),
      }
    })
  }

  static async clearCell(projectId: string, input: ProjectPayrollDeleteInput) {
    await prisma.$transaction(async (tx) => {
      const existingEntries = await tx.financePlanEntry.findMany({
        where: {
          employeeId: input.employeeId,
          projectId,
          year: input.year,
          month: input.month,
          type: {
            in: [FinancePlanType.OKLAD, FinancePlanType.NADBAVKA],
          },
        },
      })

      if (existingEntries.length === 0) {
        return
      }

      const adjustments = calculateBudgetAdjustments(existingEntries, [])

      for (const [nextProjectId, amount] of Array.from(adjustments.decrements.entries())) {
        await tx.project.update({
          where: { id: nextProjectId },
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
          projectId,
          year: input.year,
          month: input.month,
          type: {
            in: [FinancePlanType.OKLAD, FinancePlanType.NADBAVKA],
          },
        },
      })
    })
  }

  static getEmptyCell() {
    return emptyProjectPayrollCell()
  }
}
