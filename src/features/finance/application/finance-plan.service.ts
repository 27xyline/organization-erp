import { FinancePlanType, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ServiceError } from '@/lib/errors/service-error'
import { FinancePlanDeleteInput, FinancePlanSaveInput } from '../contracts/finance-plan'

import {
  buildCellPayload,
  buildNormalizedAllocations,
  calculateBudgetAdjustments,
  financePlanError,
  formatProjectBudget,
  getPlanType,
} from '../domain/finance-plan'

export type { FinancePlanRouteType } from '../domain/finance-plan'

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
  static async getSalaryTable(year: number) {
    const employees = await prisma.employee.findMany({
      where: { status: { not: 'DISMISSED' } },
      orderBy: [{ department: 'asc' }, { fullName: 'asc' }],
      include: {
        staffSchedule: { select: { id: true, position: true, department: true, rate: true, salary: true } },
      },
    })
    const employeeIds = employees.map((employee) => employee.id)
    const entries = employeeIds.length ? await prisma.financePlanEntry.findMany({
      where: {
        year, projectId: { not: null }, type: { in: [FinancePlanType.OKLAD, FinancePlanType.NADBAVKA] },
        employeeId: { in: employeeIds },
      },
      include: { project: { select: { id: true, code: true, name: true } } },
    }) : []
    const grouped = new Map<string, Array<{ amount: number; projectCode: string; typeLabel: string }>>()
    for (const entry of entries) {
      const key = `${entry.employeeId}:${entry.month}`
      const values = grouped.get(key) || []
      values.push({
        amount: Number(entry.amount),
        projectCode: entry.project?.code || '',
        typeLabel: entry.type === FinancePlanType.OKLAD ? 'Оклад' : 'Надбавка',
      })
      grouped.set(key, values)
    }
    const rows = employees.map((employee) => ({
      employeeId: employee.id,
      fullName: employee.fullName,
      department: employee.staffSchedule?.department || employee.department || '—',
      position: employee.staffSchedule?.position || '—',
      rate: Number(employee.employmentRate ?? 0).toFixed(2),
      salary: employee.staffSchedule
        ? (Number(employee.staffSchedule.salary) * Number(employee.employmentRate ?? 0)).toFixed(2)
        : '0.00',
      months: Object.fromEntries(Array.from({ length: 12 }, (_, index) => {
        const month = index + 1
        const values = grouped.get(`${employee.id}:${month}`) || []
        const projectCodes = Array.from(new Set(values.map((value) => value.projectCode).filter(Boolean)))
        return [String(month), {
          amount: values.reduce((sum, value) => sum + value.amount, 0).toFixed(2),
          projectId: null, projectCode: '', projectName: '', projectLabel: projectCodes.join(', '),
          details: values.map((value) => ({ ...value, amount: value.amount.toFixed(2) })),
        }]
      })),
    }))
    return { year, rows, projects: [] }
  }

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
