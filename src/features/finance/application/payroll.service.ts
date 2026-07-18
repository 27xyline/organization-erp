import {
  FinancePlanType,
  PayrollAdjustmentType,
  PayrollPeriodStatus,
  Prisma,
} from '@prisma/client'
import type { AccessContext } from '@/lib/auth/access-context'
import { getDb } from '@/lib/prisma'
import type {
  CreatePayrollAdjustmentInput,
  PayrollQuery,
} from '../contracts/payroll'
import { calculatePayroll } from '../domain/payroll-calculator'

export type PayrollErrorCode = 'PERIOD_CLOSED' | 'ADJUSTMENT_NOT_FOUND'

export class PayrollError extends Error {
  constructor(readonly code: PayrollErrorCode) {
    super(code)
  }
}

function signedAdjustment(type: PayrollAdjustmentType, amount: Prisma.Decimal | number) {
  return Number(amount) * (type === PayrollAdjustmentType.DEDUCTION ? -1 : 1)
}

async function ensureOpen(year: number, month: number) {
  const period = await getDb().payrollPeriod.findUnique({
    where: { year_month: { year, month } },
  })
  if (period?.status === PayrollPeriodStatus.CLOSED) throw new PayrollError('PERIOD_CLOSED')
}

export class PayrollService {
  static async getMonth(query: PayrollQuery, access: AccessContext) {
    const db = getDb()
    const [employees, period, projects] = await Promise.all([
      db.employee.findMany({
        where: {
          status: { not: 'DISMISSED' },
          ...access.employeeWhere('finance.salary.read'),
        },
        include: {
          staffSchedule: { select: { position: true, salary: true } },
          salaryEntries: { where: query, take: 1 },
          financePlanEntries: {
            where: query,
            include: { project: { select: { id: true, code: true, name: true } } },
          },
          payrollAdjustments: {
            where: query,
            include: { project: { select: { id: true, code: true, name: true } } },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { fullName: 'asc' },
      }),
      db.payrollPeriod.findUnique({
        where: { year_month: query },
        include: { closedBy: { select: { id: true, name: true, username: true } } },
      }),
      db.project.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          code: true,
          name: true,
          plannedBudget: true,
          actualBudget: true,
          endDate: true,
          financePlanEntries: { where: query, select: { amount: true } },
          payrollAdjustments: { where: query, select: { type: true, amount: true } },
        },
        orderBy: { name: 'asc' },
      }),
    ])

    const rows = employees.map((employee) => {
      const plannedBase = Number(employee.staffSchedule?.salary || 0) * Number(employee.employmentRate)
      const plannedOklad = employee.financePlanEntries
        .filter((entry) => entry.type === FinancePlanType.OKLAD)
        .reduce((sum, entry) => sum + Number(entry.amount), 0)
      const allowance = employee.financePlanEntries
        .filter((entry) => entry.type === FinancePlanType.NADBAVKA)
        .reduce((sum, entry) => sum + Number(entry.amount), 0)
      const bonus = employee.payrollAdjustments
        .filter((entry) => entry.type === PayrollAdjustmentType.BONUS)
        .reduce((sum, entry) => sum + Number(entry.amount), 0)
      const oneTime = employee.payrollAdjustments
        .filter((entry) => entry.type === PayrollAdjustmentType.ONE_TIME)
        .reduce((sum, entry) => sum + Number(entry.amount), 0)
      const deduction = employee.payrollAdjustments
        .filter((entry) => entry.type === PayrollAdjustmentType.DEDUCTION)
        .reduce((sum, entry) => sum + Number(entry.amount), 0)
      const actualBase = Number(employee.salaryEntries[0]?.amount || plannedOklad || plannedBase)
      return {
        employeeId: employee.id,
        code: employee.code,
        fullName: employee.fullName,
        department: employee.department,
        position: employee.staffSchedule?.position || '—',
        rate: Number(employee.employmentRate),
        plannedBase,
        actualBase,
        allowance,
        bonus,
        oneTime,
        deduction,
        ...calculatePayroll({
          plannedBase,
          plannedAllowance: allowance,
          actualBase,
          allowance,
          bonus,
          oneTime,
          deduction,
        }),
        adjustments: employee.payrollAdjustments.map((entry) => ({
          id: entry.id,
          type: entry.type,
          amount: Number(entry.amount),
          description: entry.description,
          project: entry.project,
          createdAt: entry.createdAt,
        })),
      }
    })

    const departmentTotals = Array.from(rows.reduce((groups, row) => {
      const current = groups.get(row.department) || {
        department: row.department,
        planned: 0,
        gross: 0,
        payable: 0,
        employerCost: 0,
      }
      current.planned += row.plannedGross
      current.gross += row.gross
      current.payable += row.payable
      current.employerCost += row.employerCost
      groups.set(row.department, current)
      return groups
    }, new Map<string, {
      department: string
      planned: number
      gross: number
      payable: number
      employerCost: number
    }>()).values())

    const selectedMonth = new Date(Date.UTC(query.year, query.month - 1, 1))
    const projectForecasts = projects.map((project) => {
      const monthlyPayroll = project.financePlanEntries.reduce(
        (sum, entry) => sum + Number(entry.amount),
        0,
      ) + project.payrollAdjustments.reduce(
        (sum, entry) => sum + signedAdjustment(entry.type, entry.amount),
        0,
      )
      const remainingMonths = project.endDate
        ? Math.max(0, (
          (project.endDate.getUTCFullYear() - selectedMonth.getUTCFullYear()) * 12 +
          project.endDate.getUTCMonth() - selectedMonth.getUTCMonth() + 1
        ))
        : 0
      const forecast = Number(project.actualBudget) + monthlyPayroll * remainingMonths
      return {
        id: project.id,
        code: project.code,
        name: project.name,
        plannedBudget: Number(project.plannedBudget),
        actualBudget: Number(project.actualBudget),
        monthlyPayroll,
        forecast,
        variance: forecast - Number(project.plannedBudget),
      }
    })

    return {
      period: period || {
        year: query.year,
        month: query.month,
        status: PayrollPeriodStatus.OPEN,
        closedAt: null,
        closedBy: null,
      },
      rows,
      departmentTotals,
      projectForecasts,
      totals: rows.reduce((totals, row) => ({
        planned: totals.planned + row.plannedGross,
        gross: totals.gross + row.gross,
        tax: totals.tax + row.tax,
        contributions: totals.contributions + row.contributions,
        payable: totals.payable + row.payable,
        employerCost: totals.employerCost + row.employerCost,
      }), { planned: 0, gross: 0, tax: 0, contributions: 0, payable: 0, employerCost: 0 }),
      options: {
        employees: employees.map(({ id, code, fullName }) => ({ id, code, fullName })),
        projects: projects.map(({ id, code, name }) => ({ id, code, name })),
      },
    }
  }

  static async createAdjustment(
    input: CreatePayrollAdjustmentInput,
    actorId: string,
    requestId?: string,
  ) {
    await ensureOpen(input.year, input.month)
    const db = getDb()
    return db.$transaction(async (tx) => {
      const adjustment = await tx.payrollAdjustment.create({
        data: { ...input, projectId: input.projectId || null, amount: new Prisma.Decimal(input.amount) },
      })
      await tx.auditLog.create({
        data: {
          userId: actorId,
          requestId,
          action: 'PAYROLL_ADJUSTMENT_CREATE',
          entityType: 'PayrollAdjustment',
          entityId: adjustment.id,
          details: { employeeId: adjustment.employeeId, year: adjustment.year, month: adjustment.month, type: adjustment.type, amount: adjustment.amount },
        },
      })
      return adjustment
    })
  }

  static async removeAdjustment(id: string, actorId: string, requestId?: string) {
    const db = getDb()
    const adjustment = await db.payrollAdjustment.findUnique({ where: { id } })
    if (!adjustment) throw new PayrollError('ADJUSTMENT_NOT_FOUND')
    await ensureOpen(adjustment.year, adjustment.month)
    await db.$transaction([
      db.payrollAdjustment.delete({ where: { id } }),
      db.auditLog.create({
        data: {
          userId: actorId,
          requestId,
          action: 'PAYROLL_ADJUSTMENT_DELETE',
          entityType: 'PayrollAdjustment',
          entityId: id,
          details: { employeeId: adjustment.employeeId, year: adjustment.year, month: adjustment.month },
        },
      }),
    ])
  }

  static async setPeriodStatus(
    query: PayrollQuery,
    status: PayrollPeriodStatus,
    actorId: string,
    requestId?: string,
  ) {
    const db = getDb()
    return db.$transaction(async (tx) => {
      const period = await tx.payrollPeriod.upsert({
        where: { year_month: query },
        create: {
          ...query,
          status,
          closedAt: status === PayrollPeriodStatus.CLOSED ? new Date() : null,
          closedById: status === PayrollPeriodStatus.CLOSED ? actorId : null,
        },
        update: {
          status,
          closedAt: status === PayrollPeriodStatus.CLOSED ? new Date() : null,
          closedById: status === PayrollPeriodStatus.CLOSED ? actorId : null,
        },
      })
      await tx.auditLog.create({
        data: {
          userId: actorId,
          requestId,
          action: status === PayrollPeriodStatus.CLOSED ? 'PAYROLL_PERIOD_CLOSE' : 'PAYROLL_PERIOD_REOPEN',
          entityType: 'PayrollPeriod',
          entityId: period.id,
          details: query,
        },
      })
      return period
    })
  }
}
