import { PayrollPeriodStatus, TimesheetStatus, type Prisma } from '@prisma/client'
import type { AccessContext } from '@/lib/auth/access-context'
import { getDb } from '@/lib/prisma'
import { TimekeepingError } from './timekeeping.error'
import { lockPayrollPeriod } from '@/lib/payroll-period-transaction'
import type { SubmitTimesheetInput, TimesheetDecisionInput } from '../contracts/time-entry'

type TimesheetDb = ReturnType<typeof getDb>

const hrRoles = new Set(['ADMIN', 'HR'])

function monthRange(year: number, month: number) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  }
}

function isHrOrAdmin(access: AccessContext) {
  return access.roles.some((role) => hrRoles.has(role))
}

async function hasEligibleDepartmentHeadAccount(
  tx: Prisma.TransactionClient,
  employeeId: string,
  departmentId: string,
  departmentParentId: string | null,
) {
  const user = await tx.user.findUnique({
    where: { employeeId },
    select: {
      isActive: true,
      employee: { select: { status: true, departmentId: true } },
      roleAssignments: {
        where: { role: { in: ['ADMIN', 'HR', 'DEPARTMENT_HEAD'] } },
        select: {
          departmentScopeMode: true,
          departmentScopes: { select: { departmentId: true } },
        },
      },
    },
  })
  if (!user?.isActive || !user.employee || user.employee.status === 'DISMISSED') return false
  if (!user.roleAssignments.length) return false

  const ancestorIds = new Set([departmentId])
  let parentId = departmentParentId
  while (parentId) {
    ancestorIds.add(parentId)
    const parent = await tx.department.findUnique({
      where: { id: parentId },
      select: { parentId: true },
    })
    parentId = parent?.parentId ?? null
  }

  return user.roleAssignments.some((assignment) => {
    if (assignment.departmentScopeMode === 'ALL') return true
    if (assignment.departmentScopeMode === 'SELF') {
      return user.employee?.departmentId === departmentId
    }
    if (assignment.departmentScopeMode !== 'ASSIGNED') return false
    return assignment.departmentScopes.some((scope) => ancestorIds.has(scope.departmentId))
  })
}

export class TimesheetService {
  constructor(private readonly db: TimesheetDb = getDb()) {}

  async listForMonth(year: number, month: number, access: AccessContext) {
    const range = monthRange(year, month)
    const scopes: Prisma.EmployeeWhereInput[] = []
    if (isHrOrAdmin(access)) scopes.push({})
    if (access.has('timekeeping.timesheets.read')) {
      scopes.push(access.employeeWhere('timekeeping.timesheets.read') as Prisma.EmployeeWhereInput)
    }
    if (access.has('timekeeping.timesheets.review')) {
      scopes.push(access.employeeWhere('timekeeping.timesheets.review') as Prisma.EmployeeWhereInput)
    }
    if (access.identity.employeeId) scopes.push({ id: access.identity.employeeId })
    if (!scopes.length) return []

    const employees = await this.db.employee.findMany({
      where: {
        AND: [
          { OR: scopes },
          {
            OR: [
              { status: { not: 'DISMISSED' } },
              { timeEntries: { some: { workDate: { gte: range.start, lt: range.end } } } },
            ],
          },
        ],
      },
      select: {
        id: true,
        fullName: true,
        code: true,
        department: true,
        departmentId: true,
        timesheets: {
          where: { year, month },
          include: {
            submittedBy: { select: { id: true, name: true } },
            decidedBy: { select: { id: true, name: true } },
          },
          take: 1,
        },
      },
      orderBy: { fullName: 'asc' },
    })

    return employees.map((employee) => {
      const timesheet = employee.timesheets[0]
      return timesheet
        ? { ...timesheet, employee: {
          id: employee.id,
          fullName: employee.fullName,
          code: employee.code,
          department: employee.department,
          departmentId: employee.departmentId,
        } }
        : {
          id: `draft:${employee.id}:${year}:${month}`,
          employeeId: employee.id,
          year,
          month,
          status: TimesheetStatus.DRAFT,
          zeroHoursConfirmed: false,
          submittedById: null,
          submittedBy: null,
          submittedAt: null,
          decidedById: null,
          decidedBy: null,
          decidedAt: null,
          decisionReason: null,
          employee: {
            id: employee.id,
            fullName: employee.fullName,
            code: employee.code,
            department: employee.department,
            departmentId: employee.departmentId,
          },
        }
    })
  }

  async submit(
    input: SubmitTimesheetInput,
    actorId: string,
    actorEmployeeId: string | null,
    access: AccessContext,
    requestId?: string,
  ) {
    return this.db.$transaction(async (tx) => {
      const periodStatus = await lockPayrollPeriod(tx, input.year, input.month)
      if (periodStatus === PayrollPeriodStatus.CLOSED) throw new TimekeepingError('PERIOD_CLOSED')

      const isOwnSubmission = actorEmployeeId === input.employeeId &&
        access.has('timekeeping.timesheets.submit')
      if (!isOwnSubmission && !isHrOrAdmin(access)) throw new TimekeepingError('FORBIDDEN')

      const employee = await tx.employee.findUnique({
        where: { id: input.employeeId },
        select: { id: true, status: true },
      })
      if (!employee) throw new TimekeepingError('NOT_FOUND')

      const range = monthRange(input.year, input.month)
      const entryCount = await tx.timeEntry.count({
        where: { employeeId: input.employeeId, workDate: { gte: range.start, lt: range.end } },
      })
      if (entryCount === 0 && !input.zeroHoursConfirmed) {
        throw new TimekeepingError('ZERO_HOURS_CONFIRMATION_REQUIRED')
      }

      const current = await tx.timesheet.findUnique({
        where: { employeeId_year_month: {
          employeeId: input.employeeId,
          year: input.year,
          month: input.month,
        } },
        select: { id: true, status: true },
      })
      if (current?.status === TimesheetStatus.SUBMITTED || current?.status === TimesheetStatus.APPROVED) {
        throw new TimekeepingError('TIMESHEET_STATE_INVALID')
      }

      const data = {
        status: TimesheetStatus.SUBMITTED,
        zeroHoursConfirmed: entryCount === 0,
        submittedById: actorId,
        submittedAt: new Date(),
        decidedById: null,
        decidedAt: null,
        decisionReason: null,
      }
      const timesheet = current
        ? await tx.timesheet.update({ where: { id: current.id }, data })
        : await tx.timesheet.create({
          data: {
            employeeId: input.employeeId,
            year: input.year,
            month: input.month,
            ...data,
          },
        })
      await tx.auditLog.create({
        data: {
          userId: actorId,
          requestId,
          action: 'TIMESHEET_SUBMIT',
          entityType: 'Timesheet',
          entityId: timesheet.id,
          details: {
            employeeId: input.employeeId,
            year: input.year,
            month: input.month,
            zeroHoursConfirmed: entryCount === 0,
          },
        },
      })
      return timesheet
    })
  }

  async decide(
    id: string,
    input: TimesheetDecisionInput,
    actorId: string,
    actorEmployeeId: string | null,
    access: AccessContext,
    requestId?: string,
  ) {
    return this.db.$transaction(async (tx) => {
      const initial = await tx.timesheet.findUnique({
        where: { id },
        select: { year: true, month: true },
      })
      if (!initial) throw new TimekeepingError('NOT_FOUND')
      const periodStatus = await lockPayrollPeriod(tx, initial.year, initial.month)
      if (periodStatus === PayrollPeriodStatus.CLOSED) throw new TimekeepingError('PERIOD_CLOSED')

      const timesheet = await tx.timesheet.findUnique({
        where: { id },
        include: {
          employee: {
            select: {
              id: true,
              departmentId: true,
              departmentRef: { select: { id: true, parentId: true, headEmployeeId: true } },
            },
          },
        },
      })
      if (!timesheet) throw new TimekeepingError('NOT_FOUND')
      if (timesheet.status !== TimesheetStatus.SUBMITTED) {
        throw new TimekeepingError('TIMESHEET_STATE_INVALID')
      }
      if (!access.has('timekeeping.timesheets.review')) {
        throw new TimekeepingError('TIMESHEET_DECISION_FORBIDDEN')
      }
      if (actorEmployeeId === timesheet.employeeId) {
        throw new TimekeepingError('TIMESHEET_DECISION_FORBIDDEN')
      }

      const privileged = isHrOrAdmin(access)
      let fallbackRequiresReason = false
      let expectedHeadId = timesheet.employee.departmentRef.headEmployeeId
      if (expectedHeadId === timesheet.employeeId) {
        let departmentId = timesheet.employee.departmentRef.parentId
        expectedHeadId = null
        while (departmentId) {
          const ancestor = await tx.department.findUnique({
            where: { id: departmentId },
            select: { parentId: true, headEmployeeId: true },
          })
          if (!ancestor) break
          if (ancestor.headEmployeeId) {
            expectedHeadId = ancestor.headEmployeeId
            break
          }
          departmentId = ancestor.parentId
        }
        if (!expectedHeadId) fallbackRequiresReason = true
      } else if (!expectedHeadId) {
        fallbackRequiresReason = true
      }

      if (expectedHeadId && !await hasEligibleDepartmentHeadAccount(
        tx,
        expectedHeadId,
        timesheet.employee.departmentRef.id,
        timesheet.employee.departmentRef.parentId,
      )) {
        expectedHeadId = null
        fallbackRequiresReason = true
      }

      const inScope = access.allows('timekeeping.timesheets.review', {
        departmentId: timesheet.employee.departmentId,
      })
      if (fallbackRequiresReason) {
        if (!privileged || !inScope) throw new TimekeepingError('TIMESHEET_DECISION_FORBIDDEN')
        if (!input.reason?.trim()) throw new TimekeepingError('APPROVAL_REASON_REQUIRED')
      } else {
        if (!inScope || actorEmployeeId !== expectedHeadId) {
          throw new TimekeepingError('TIMESHEET_DECISION_FORBIDDEN')
        }
      }
      if (input.decision === 'RETURN' && !input.reason?.trim()) {
        throw new TimekeepingError('APPROVAL_REASON_REQUIRED')
      }

      const nextStatus = input.decision === 'APPROVE'
        ? TimesheetStatus.APPROVED
        : TimesheetStatus.RETURNED
      const reason = input.reason?.trim() || null
      const updated = await tx.timesheet.update({
        where: { id },
        data: {
          status: nextStatus,
          decidedById: actorId,
          decidedAt: new Date(),
          decisionReason: reason,
        },
      })
      await tx.auditLog.create({
        data: {
          userId: actorId,
          requestId,
          action: input.decision === 'APPROVE' ? 'TIMESHEET_APPROVE' : 'TIMESHEET_RETURN',
          entityType: 'Timesheet',
          entityId: id,
          details: {
            employeeId: timesheet.employeeId,
            year: timesheet.year,
            month: timesheet.month,
            reason,
            ...(fallbackRequiresReason ? { approvalFallback: true } : {}),
          },
        },
      })
      return updated
    })
  }
}
