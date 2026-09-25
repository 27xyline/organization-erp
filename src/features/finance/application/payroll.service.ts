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
import { lockPayrollPeriod } from '@/lib/payroll-period-transaction'

export type PayrollErrorCode =
  | 'PERIOD_CLOSED'
  | 'ADJUSTMENT_NOT_FOUND'
  | 'PAYROLL_TIMESHEETS_PENDING'
  | 'REOPEN_REASON_REQUIRED'

export class PayrollError extends Error {
  constructor(readonly code: PayrollErrorCode) {
    super(code)
  }
}

function signedAdjustment(type: PayrollAdjustmentType, amount: Prisma.Decimal | number) {
  return Number(amount) * (type === PayrollAdjustmentType.DEDUCTION ? -1 : 1)
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
    const db = getDb()
    return db.$transaction(async (tx) => {
      if (await lockPayrollPeriod(tx, input.year, input.month) === PayrollPeriodStatus.CLOSED) {
        throw new PayrollError('PERIOD_CLOSED')
      }
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
    await db.$transaction(async (tx) => {
      const initial = await tx.payrollAdjustment.findUnique({
        where: { id },
        select: { year: true, month: true },
      })
      if (!initial) throw new PayrollError('ADJUSTMENT_NOT_FOUND')
      if (await lockPayrollPeriod(tx, initial.year, initial.month) === PayrollPeriodStatus.CLOSED) {
        throw new PayrollError('PERIOD_CLOSED')
      }
      const adjustment = await tx.payrollAdjustment.findUnique({ where: { id } })
      if (!adjustment) throw new PayrollError('ADJUSTMENT_NOT_FOUND')
      await tx.payrollAdjustment.delete({ where: { id } })
      await tx.auditLog.create({
        data: {
          userId: actorId,
          requestId,
          action: 'PAYROLL_ADJUSTMENT_DELETE',
          entityType: 'PayrollAdjustment',
          entityId: id,
          details: { employeeId: adjustment.employeeId, year: adjustment.year, month: adjustment.month },
        },
      })
    })
  }

  static async setPeriodStatus(
    query: PayrollQuery,
    status: PayrollPeriodStatus,
    actorId: string,
    requestId?: string,
    reason?: string,
  ) {
    const db = getDb()
    return db.$transaction(async (tx) => {
      const currentStatus = await lockPayrollPeriod(tx, query.year, query.month)
      const current = await tx.payrollPeriod.findUnique({ where: { year_month: query } })
      if (!current) throw new Error('Payroll period lock did not create the period')
      if (currentStatus === status) return current

      if (
        currentStatus === PayrollPeriodStatus.CLOSED &&
        status === PayrollPeriodStatus.OPEN &&
        !reason?.trim()
      ) throw new PayrollError('REOPEN_REASON_REQUIRED')

      if (status === PayrollPeriodStatus.CLOSED) {
        const start = new Date(Date.UTC(query.year, query.month - 1, 1))
        const end = new Date(Date.UTC(query.year, query.month, 1))
        const employees = await tx.employee.findMany({
          where: {
            OR: [
              { status: { not: 'DISMISSED' } },
              { timeEntries: { some: { workDate: { gte: start, lt: end } } } },
            ],
          },
          select: {
            id: true,
            timesheets: {
              where: { year: query.year, month: query.month },
              select: { status: true, zeroHoursConfirmed: true },
              take: 1,
            },
            _count: {
              select: {
                timeEntries: { where: { workDate: { gte: start, lt: end } } },
              },
            },
          },
        })
        const pendingCount = employees.filter((employee) => {
          const timesheet = employee.timesheets[0]
          if (timesheet?.status !== 'APPROVED') return true
          return employee._count.timeEntries === 0 && !timesheet.zeroHoursConfirmed
        }).length
        if (pendingCount > 0) throw new PayrollError('PAYROLL_TIMESHEETS_PENDING')
      }

      const period = await tx.payrollPeriod.update({
        where: { id: current.id },
        data: {
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
          details: { ...query, ...(reason?.trim() ? { reason: reason.trim() } : {}) },
        },
      })
      return period
    })
  }
}
