import { PayrollPeriodStatus, Prisma, TimeEntryType, TimesheetStatus } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import type { AccessContext } from '@/lib/auth/access-context'
import { prisma } from '@/lib/prisma'
import type {
  CreateTimeEntryInput,
  TimeEntryQuery,
  UpdateTimeEntryInput,
} from '../contracts/time-entry'
import {
  calculateLaborAmounts,
  standardMonthlyHours,
} from '../domain/labor-calculator'
import {
  lockPayrollPeriod,
  lockPayrollPeriods,
  payrollMonthKey,
} from '@/lib/payroll-period-transaction'
import { TimekeepingError } from './timekeeping.error'
import { TimesheetService } from './timesheet.service'

export { TimekeepingError, type TimekeepingErrorCode } from './timekeeping.error'

const privilegedReadRoles = new Set(['ADMIN', 'HR', 'ACCOUNTANT', 'AUDITOR'])
const privilegedWriteRoles = new Set(['ADMIN', 'HR'])

function monthRange(year: number, month: number) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  }
}

function visibleWhere(access: AccessContext): Prisma.TimeEntryWhereInput {
  if (access.roles.some((role) => privilegedReadRoles.has(role))) return {}
  const clauses: Prisma.TimeEntryWhereInput[] = []
  if (access.has('employees.read')) {
    clauses.push({ employee: access.employeeWhere('employees.read') })
  }
  if (access.has('projects.read')) {
    clauses.push({ project: access.projectWhere('projects.read') })
  }
  return clauses.length ? { OR: clauses } : { id: '__none__' }
}

async function mutationTarget(
  employeeId: string,
  projectId: string | null | undefined,
  taskId: string | null | undefined,
  db: Prisma.TransactionClient | PrismaClient = prisma,
) {
  const [employee, project, task] = await Promise.all([
    db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, departmentId: true },
    }),
    projectId
      ? db.project.findUnique({ where: { id: projectId }, select: { id: true } })
      : null,
    taskId
      ? db.task.findUnique({ where: { id: taskId }, select: { id: true, projectId: true } })
      : null,
  ])
  if (!employee || (projectId && !project) || (taskId && !task)) {
    throw new TimekeepingError('INVALID_REFERENCE')
  }
  if (task && (!projectId || task.projectId !== projectId)) {
    throw new TimekeepingError('INVALID_REFERENCE')
  }
  return { employee, projectId: project?.id || null }
}

function canMutate(access: AccessContext, target: Awaited<ReturnType<typeof mutationTarget>>) {
  if (access.roles.some((role) => privilegedWriteRoles.has(role))) return true
  if (access.identity.employeeId === target.employee.id) return true
  return Boolean(
    target.projectId &&
    access.allows('projects.update', { projectId: target.projectId }),
  )
}

async function ensureDailyLimit(
  db: Prisma.TransactionClient | PrismaClient,
  employeeId: string,
  workDate: Date,
  hours: number,
  excludeId?: string,
) {
  const result = await db.timeEntry.aggregate({
    where: {
      employeeId,
      workDate,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    _sum: { hours: true },
  })
  if (Number(result._sum.hours || 0) + hours > 24) {
    throw new TimekeepingError('DAILY_HOURS_EXCEEDED')
  }
}

async function assertEntryWritable(
  tx: Prisma.TransactionClient,
  employeeId: string,
  workDate: Date,
  access: AccessContext,
  correctionReason?: string,
  periodStatus?: PayrollPeriodStatus,
) {
  const status = periodStatus || await lockPayrollPeriod(
    tx,
    workDate.getUTCFullYear(),
    workDate.getUTCMonth() + 1,
  )
  if (status === PayrollPeriodStatus.CLOSED) throw new TimekeepingError('PERIOD_CLOSED')
  const timesheet = await tx.timesheet.findUnique({
    where: {
      employeeId_year_month: {
        employeeId,
        year: workDate.getUTCFullYear(),
        month: workDate.getUTCMonth() + 1,
      },
    },
    select: { status: true },
  })
  if (timesheet?.status === TimesheetStatus.SUBMITTED) {
    throw new TimekeepingError('TIMESHEET_LOCKED')
  }
  if (timesheet?.status === TimesheetStatus.APPROVED) {
    if (!access.has('timekeeping.timesheets.correct')) {
      throw new TimekeepingError('TIMESHEET_LOCKED')
    }
    if (!correctionReason?.trim()) throw new TimekeepingError('CORRECTION_REASON_REQUIRED')
    return true
  }
  return false
}

async function invalidateCorrectedTimesheet(
  tx: Prisma.TransactionClient,
  employeeId: string,
  workDate: Date,
  isCorrection: boolean,
) {
  if (!isCorrection) return
  await tx.timesheet.updateMany({
    where: {
      employeeId,
      year: workDate.getUTCFullYear(),
      month: workDate.getUTCMonth() + 1,
      status: TimesheetStatus.APPROVED,
    },
    data: {
      status: TimesheetStatus.DRAFT,
      zeroHoursConfirmed: false,
      submittedById: null,
      submittedAt: null,
      decidedById: null,
      decidedAt: null,
      decisionReason: null,
    },
  })
}

export class TimekeepingService {
  static async getMonth(query: TimeEntryQuery, access: AccessContext) {
    const range = monthRange(query.year, query.month)
    const where: Prisma.TimeEntryWhereInput = {
      AND: [
        visibleWhere(access),
        { workDate: { gte: range.start, lt: range.end } },
        ...(query.employeeId ? [{ employeeId: query.employeeId }] : []),
        ...(query.projectId ? [{ projectId: query.projectId }] : []),
      ],
    }
    const [entries, timesheets, period] = await Promise.all([
      prisma.timeEntry.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              code: true,
              fullName: true,
              department: true,
              employmentRate: true,
              staffSchedule: { select: { position: true, salary: true } },
            },
          },
          project: { select: { id: true, code: true, name: true } },
          task: { select: { id: true, name: true } },
        },
        orderBy: [{ workDate: 'asc' }, { employee: { fullName: 'asc' } }],
      }),
      new TimesheetService().listForMonth(query.year, query.month, access),
      prisma.payrollPeriod.findUnique({
        where: { year_month: { year: query.year, month: query.month } },
        select: { status: true },
      }),
    ])

    const normativeHours = standardMonthlyHours(query.year, query.month)
    const rows = new Map<string, {
      employeeId: string
      employeeName: string
      department: string
      rate: number
      baseSalary: number
      regularHours: number
      vacationHours: number
      sickHours: number
      tripHours: number
      overtimeHours: number
      calculatedSalary: number
      projectCost: number
      projectHours: number
      projectOvertimeHours: number
    }>()
    for (const entry of entries) {
      const salary = Number(entry.employee.staffSchedule?.salary || 0)
      const rate = Number(entry.employee.employmentRate)
      const baseSalary = salary * rate
      const row = rows.get(entry.employeeId) || {
        employeeId: entry.employeeId,
        employeeName: entry.employee.fullName,
        department: entry.employee.department,
        rate,
        baseSalary,
        regularHours: 0,
        vacationHours: 0,
        sickHours: 0,
        tripHours: 0,
        overtimeHours: 0,
        calculatedSalary: 0,
        projectCost: 0,
        projectHours: 0,
        projectOvertimeHours: 0,
      }
      const hours = Number(entry.hours)
      if (entry.type === TimeEntryType.REGULAR) row.regularHours += hours
      if (entry.type === TimeEntryType.VACATION) row.vacationHours += hours
      if (entry.type === TimeEntryType.SICK_LEAVE) row.sickHours += hours
      if (entry.type === TimeEntryType.BUSINESS_TRIP) row.tripHours += hours
      if (entry.type === TimeEntryType.OVERTIME) row.overtimeHours += hours
      const countsAsProjectWork =
        entry.type === TimeEntryType.REGULAR ||
        entry.type === TimeEntryType.BUSINESS_TRIP ||
        entry.type === TimeEntryType.OVERTIME
      if (entry.projectId && countsAsProjectWork) {
        if (entry.type === TimeEntryType.OVERTIME) row.projectOvertimeHours += hours
        else row.projectHours += hours
      }
      rows.set(entry.employeeId, row)
    }
    for (const row of rows.values()) {
      const paidHours = row.regularHours + row.vacationHours + row.sickHours + row.tripHours
      const amounts = calculateLaborAmounts({
        baseSalary: row.baseSalary,
        normativeHours,
        paidHours,
        overtimeHours: row.overtimeHours,
        projectHours: row.projectHours,
        projectOvertimeHours: row.projectOvertimeHours,
      })
      row.calculatedSalary = amounts.calculatedSalary
      row.projectCost = amounts.projectCost
    }

    return {
      year: query.year,
      month: query.month,
      normativeHours,
      entries,
      timesheets,
      period: { status: period?.status || 'OPEN' },
      summaries: Array.from(rows.values()).sort((a, b) =>
        a.employeeName.localeCompare(b.employeeName, 'ru')),
    }
  }

  static async options(access: AccessContext) {
    const canReadAll = access.roles.some((role) => privilegedReadRoles.has(role))
    const employeeWhere: Prisma.EmployeeWhereInput = canReadAll
      ? { status: { not: 'DISMISSED' } }
      : access.has('employees.read')
        ? access.employeeWhere('employees.read')
        : access.has('projects.read')
          ? {
            projectMembers: {
              some: {
                isArchived: false,
                project: access.projectWhere('projects.read'),
              },
            },
          }
          : { id: '__none__' }
    const [employees, projects] = await Promise.all([
      prisma.employee.findMany({
        where: employeeWhere,
        select: {
          id: true,
          code: true,
          fullName: true,
          department: true,
        },
        orderBy: { fullName: 'asc' },
      }),
      prisma.project.findMany({
        where: canReadAll
          ? { status: 'ACTIVE' }
          : access.projectWhere('projects.read'),
        select: {
          id: true,
          code: true,
          name: true,
          tasksList: {
            select: { id: true, name: true },
            orderBy: [{ level: 'asc' }, { name: 'asc' }],
          },
        },
        orderBy: { name: 'asc' },
      }),
    ])
    return { employees, projects }
  }

  static async create(
    input: CreateTimeEntryInput,
    access: AccessContext,
    actorId: string,
    requestId?: string,
  ) {
    const { correctionReason, ...entryInput } = input
    return prisma.$transaction(async (tx) => {
      const correcting = await assertEntryWritable(
        tx,
        input.employeeId,
        input.workDate,
        access,
        correctionReason,
      )
      const target = await mutationTarget(input.employeeId, input.projectId, input.taskId, tx)
      if (!canMutate(access, target)) throw new TimekeepingError('FORBIDDEN')
      await ensureDailyLimit(tx, input.employeeId, input.workDate, input.hours)
      const entry = await tx.timeEntry.create({
        data: {
          ...entryInput,
          projectId: input.projectId || null,
          taskId: input.taskId || null,
          note: input.note || null,
          hours: new Prisma.Decimal(input.hours),
        },
      })
      await invalidateCorrectedTimesheet(tx, input.employeeId, input.workDate, correcting)
      await tx.auditLog.create({
        data: {
          userId: actorId,
          requestId,
          action: correcting ? 'TIME_ENTRY_CORRECTION' : 'TIME_ENTRY_CREATE',
          entityType: 'TimeEntry',
          entityId: entry.id,
          details: {
            employeeId: entry.employeeId,
            workDate: entry.workDate,
            hours: entry.hours,
            ...(correcting ? { correctionReason: correctionReason?.trim() } : {}),
          },
        },
      })
      return entry
    })
  }

  static async update(
    id: string,
    input: UpdateTimeEntryInput,
    access: AccessContext,
    actorId: string,
    requestId?: string,
  ) {
    const { correctionReason, ...entryInput } = input
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "time_entries" WHERE "id" = ${id} FOR UPDATE`)
      const current = await tx.timeEntry.findUnique({ where: { id } })
      if (!current) throw new TimekeepingError('NOT_FOUND')
      const employeeId = input.employeeId || current.employeeId
      const projectId = input.projectId === undefined ? current.projectId : input.projectId
      const taskId = input.taskId === undefined ? current.taskId : input.taskId
      const workDate = input.workDate || current.workDate
      const hours = input.hours ?? Number(current.hours)
      const periods = await lockPayrollPeriods(tx, [current.workDate, workDate])
      const currentKey = payrollMonthKey(current.workDate)
      const nextKey = payrollMonthKey(workDate)
      const currentCorrection = await assertEntryWritable(
        tx,
        current.employeeId,
        current.workDate,
        access,
        correctionReason,
        periods.get(currentKey),
      )
      const nextCorrection = await assertEntryWritable(
        tx,
        employeeId,
        workDate,
        access,
        correctionReason,
        periods.get(nextKey),
      )
      const currentTarget = await mutationTarget(
        current.employeeId,
        current.projectId,
        current.taskId,
        tx,
      )
      const target = await mutationTarget(employeeId, projectId, taskId, tx)
      if (!canMutate(access, currentTarget) || !canMutate(access, target)) {
        throw new TimekeepingError('FORBIDDEN')
      }
      await ensureDailyLimit(tx, employeeId, workDate, hours, id)
      const entry = await tx.timeEntry.update({
        where: { id },
        data: {
          ...entryInput,
          projectId,
          taskId,
          note: input.note === undefined ? undefined : input.note || null,
          hours: input.hours === undefined ? undefined : new Prisma.Decimal(input.hours),
        },
      })
      const correctionPairs = new Map<string, { employeeId: string; date: Date; correction: boolean }>()
      correctionPairs.set(`${current.employeeId}:${currentKey}`, {
        employeeId: current.employeeId,
        date: current.workDate,
        correction: currentCorrection,
      })
      correctionPairs.set(`${employeeId}:${nextKey}`, {
        employeeId,
        date: workDate,
        correction: nextCorrection,
      })
      for (const pair of correctionPairs.values()) {
        await invalidateCorrectedTimesheet(tx, pair.employeeId, pair.date, pair.correction)
      }
      await tx.auditLog.create({
        data: {
          userId: actorId,
          requestId,
          action: currentCorrection || nextCorrection ? 'TIME_ENTRY_CORRECTION' : 'TIME_ENTRY_UPDATE',
          entityType: 'TimeEntry',
          entityId: id,
          details: {
            employeeId,
            workDate,
            hours,
            ...(currentCorrection || nextCorrection
              ? { correctionReason: correctionReason?.trim() }
              : {}),
          },
        },
      })
      return entry
    })
  }

  static async remove(
    id: string,
    access: AccessContext,
    actorId: string,
    requestId?: string,
    correctionReason?: string,
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "time_entries" WHERE "id" = ${id} FOR UPDATE`)
      const current = await tx.timeEntry.findUnique({ where: { id } })
      if (!current) throw new TimekeepingError('NOT_FOUND')
      const periodStatus = await lockPayrollPeriod(
        tx,
        current.workDate.getUTCFullYear(),
        current.workDate.getUTCMonth() + 1,
      )
      const correcting = await assertEntryWritable(
        tx,
        current.employeeId,
        current.workDate,
        access,
        correctionReason,
        periodStatus,
      )
      const target = await mutationTarget(current.employeeId, current.projectId, current.taskId, tx)
      if (!canMutate(access, target)) throw new TimekeepingError('FORBIDDEN')
      await tx.timeEntry.delete({ where: { id } })
      await invalidateCorrectedTimesheet(tx, current.employeeId, current.workDate, correcting)
      await tx.auditLog.create({
        data: {
          userId: actorId,
          requestId,
          action: correcting ? 'TIME_ENTRY_CORRECTION' : 'TIME_ENTRY_DELETE',
          entityType: 'TimeEntry',
          entityId: id,
          details: {
            employeeId: current.employeeId,
            workDate: current.workDate,
            ...(correcting ? { correctionReason: correctionReason?.trim() } : {}),
          },
        },
      })
    })
  }
}
