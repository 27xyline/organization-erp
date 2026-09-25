import {
  AppRole,
  PayrollPeriodStatus,
  PrismaClient,
  TimeEntryType,
} from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AccessContext } from '@/lib/auth/access-context'
import { PayrollError, PayrollService } from '@/features/finance/application/payroll.service'
import { TimekeepingError } from '../timekeeping.error'
import { TimekeepingService } from '../timekeeping.service'
import { TimesheetService } from '../timesheet.service'

const url = process.env.TEST_DATABASE_URL
const describeDb = url ? describe : describe.skip

describeDb('timesheet workflow PostgreSQL integration', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'postgresql://unused:unused@127.0.0.1:1/unused' } } })
  const marker = `timesheet-${crypto.randomUUID()}`
  let departmentId = ''
  let employeeId = ''
  let lateEmployeeId = ''
  let headEmployeeId = ''
  let employeeUserId = ''
  let headUserId = ''
  const approvalMonth = { year: 2097, month: 7 }
  const raceMonth = { year: 2097, month: 8 }

  beforeAll(async () => {
    const department = await db.department.create({
      data: { code: `${marker}-D`, name: marker },
    })
    departmentId = department.id
    const [employee, head] = await Promise.all([
      db.employee.create({
        data: { code: `${marker}-E`, fullName: `${marker} employee`, department: marker, departmentId },
      }),
      db.employee.create({
        data: { code: `${marker}-H`, fullName: `${marker} head`, department: marker, departmentId },
      }),
    ])
    employeeId = employee.id
    headEmployeeId = head.id
    const lateEmployee = await db.employee.create({
      data: {
        code: `${marker}-L`,
        fullName: `${marker} late employee`,
        department: marker,
        departmentId,
        createdAt: new Date(Date.UTC(2098, 0, 1)),
      },
    })
    lateEmployeeId = lateEmployee.id
    await db.department.update({ where: { id: departmentId }, data: { headEmployeeId } })
    const [employeeUser, headUser] = await Promise.all([
      db.user.create({
        data: {
          username: `${marker}-employee`, name: `${marker} employee`, passwordHash: 'test', employeeId,
        },
      }),
      db.user.create({
        data: {
          username: `${marker}-head`, name: `${marker} head`, passwordHash: 'test', employeeId: headEmployeeId,
          roleAssignments: {
            create: {
              role: AppRole.DEPARTMENT_HEAD,
              departmentScopeMode: 'ASSIGNED',
              projectScopeMode: 'NONE',
              departmentScopes: { create: { departmentId } },
            },
          },
        },
      }),
    ])
    employeeUserId = employeeUser.id
    headUserId = headUser.id
  })

  afterAll(async () => {
    await db.payrollPeriod.deleteMany({
      where: { OR: [approvalMonth, raceMonth] },
    })
    if (employeeUserId) await db.user.deleteMany({ where: { id: { in: [employeeUserId, headUserId] } } })
    if (employeeId || headEmployeeId || lateEmployeeId) {
      await db.employee.deleteMany({ where: { id: { in: [employeeId, headEmployeeId, lateEmployeeId] } } })
    }
    if (departmentId) await db.department.delete({ where: { id: departmentId } })
    await db.$disconnect()
  })

  function access(userId: string, targetEmployeeId: string, role: AppRole) {
    return new AccessContext(
      {
        userId,
        employeeId: targetEmployeeId,
        employeeDepartmentId: departmentId,
        memberProjectIds: [],
      },
      [{
        assignmentId: `${marker}-${role}`,
        role,
        departmentScopeMode: 'ASSIGNED',
        projectScopeMode: 'NONE',
        departmentIds: [departmentId],
        projectIds: [],
      }],
    )
  }

  it('requires a confirmed zero-hour sheet, routes approval, and blocks close while pending', async () => {
    const employeeAccess = access(employeeUserId, employeeId, AppRole.EMPLOYEE)
    const headAccess = access(headUserId, headEmployeeId, AppRole.DEPARTMENT_HEAD)
    await db.timesheet.create({
      data: {
        employeeId: headEmployeeId,
        ...approvalMonth,
        status: 'APPROVED',
        zeroHoursConfirmed: true,
      },
    })

    await expect(new TimesheetService(db).submit({
      employeeId,
      ...approvalMonth,
      zeroHoursConfirmed: false,
    }, employeeUserId, employeeId, employeeAccess)).rejects.toMatchObject({
      code: 'ZERO_HOURS_CONFIRMATION_REQUIRED',
    } satisfies Partial<TimekeepingError>)

    const sheet = await new TimesheetService(db).submit({
      employeeId,
      ...approvalMonth,
      zeroHoursConfirmed: true,
    }, employeeUserId, employeeId, employeeAccess)
    expect(sheet.status).toBe('SUBMITTED')
    await expect(TimekeepingService.create({
      employeeId,
      workDate: new Date(Date.UTC(approvalMonth.year, approvalMonth.month - 1, 11)),
      type: TimeEntryType.REGULAR,
      hours: 8,
    }, employeeAccess, employeeUserId)).rejects.toMatchObject({
      code: 'TIMESHEET_LOCKED',
    } satisfies Partial<TimekeepingError>)

    await expect(PayrollService.setPeriodStatus(
      approvalMonth,
      PayrollPeriodStatus.CLOSED,
      headUserId,
    )).rejects.toMatchObject({ code: 'PAYROLL_TIMESHEETS_PENDING' } satisfies Partial<PayrollError>)

    await expect(new TimesheetService(db).decide(
      sheet.id,
      { decision: 'APPROVE' },
      headUserId,
      headEmployeeId,
      headAccess,
    )).resolves.toMatchObject({ status: 'APPROVED' })

    await expect(PayrollService.setPeriodStatus(
      approvalMonth,
      PayrollPeriodStatus.CLOSED,
      headUserId,
    )).rejects.toMatchObject({ code: 'PAYROLL_TIMESHEETS_PENDING' } satisfies Partial<PayrollError>)
    await db.timesheet.create({
      data: {
        employeeId: lateEmployeeId,
        ...approvalMonth,
        status: 'APPROVED',
        zeroHoursConfirmed: true,
      },
    })

    const period = await PayrollService.setPeriodStatus(
      approvalMonth,
      PayrollPeriodStatus.CLOSED,
      headUserId,
    )
    expect(period.status).toBe('CLOSED')
    await expect(PayrollService.setPeriodStatus(
      approvalMonth,
      PayrollPeriodStatus.OPEN,
      headUserId,
    )).rejects.toMatchObject({ code: 'REOPEN_REASON_REQUIRED' } satisfies Partial<PayrollError>)
    await expect(PayrollService.setPeriodStatus(
      approvalMonth,
      PayrollPeriodStatus.OPEN,
      headUserId,
      undefined,
      'Исправление расчётного периода',
    )).resolves.toMatchObject({ status: 'OPEN' })
    await expect(PayrollService.setPeriodStatus(
      approvalMonth,
      PayrollPeriodStatus.CLOSED,
      headUserId,
    )).resolves.toMatchObject({ status: 'CLOSED' })
    await expect(TimekeepingService.create({
      employeeId,
      workDate: new Date(Date.UTC(approvalMonth.year, approvalMonth.month - 1, 12)),
      type: TimeEntryType.REGULAR,
      hours: 8,
    }, access(headUserId, headEmployeeId, AppRole.ADMIN), headUserId)).rejects.toMatchObject({
      code: 'PERIOD_CLOSED',
    } satisfies Partial<TimekeepingError>)
  })

  it('serializes closing against corrections to an approved timesheet', async () => {
    const employeeAccess = access(employeeUserId, employeeId, AppRole.EMPLOYEE)
    const headAccess = access(headUserId, headEmployeeId, AppRole.DEPARTMENT_HEAD)
    const adminAccess = access(headUserId, headEmployeeId, AppRole.ADMIN)
    await db.timesheet.create({
      data: {
        employeeId: headEmployeeId,
        ...raceMonth,
        status: 'APPROVED',
        zeroHoursConfirmed: true,
      },
    })
    const sheet = await new TimesheetService(db).submit({
      employeeId,
      ...raceMonth,
      zeroHoursConfirmed: true,
    }, employeeUserId, employeeId, employeeAccess)
    await new TimesheetService(db).decide(
      sheet.id,
      { decision: 'APPROVE' },
      headUserId,
      headEmployeeId,
      headAccess,
    )
    await expect(TimekeepingService.create({
      employeeId,
      workDate: new Date(Date.UTC(raceMonth.year, raceMonth.month - 1, 12)),
      type: TimeEntryType.REGULAR,
      hours: 8,
    }, adminAccess, headUserId)).rejects.toMatchObject({
      code: 'CORRECTION_REASON_REQUIRED',
    } satisfies Partial<TimekeepingError>)

    const [closeResult, correctionResult] = await Promise.allSettled([
      PayrollService.setPeriodStatus(raceMonth, PayrollPeriodStatus.CLOSED, headUserId),
      TimekeepingService.create({
        employeeId,
        workDate: new Date(Date.UTC(raceMonth.year, raceMonth.month - 1, 12)),
        type: TimeEntryType.REGULAR,
        hours: 8,
        correctionReason: 'Исправление подтверждено',
      }, adminAccess, headUserId),
    ])
    expect([closeResult.status, correctionResult.status].filter((status) => status === 'fulfilled'))
      .toHaveLength(1)

    const period = await db.payrollPeriod.findUnique({ where: { year_month: raceMonth } })
    if (period?.status === 'CLOSED') {
      expect(correctionResult.status).toBe('rejected')
      expect(correctionResult.status === 'rejected' && correctionResult.reason).toMatchObject({ code: 'PERIOD_CLOSED' })
    } else {
      expect(closeResult.status).toBe('rejected')
      expect(closeResult.status === 'rejected' && closeResult.reason).toMatchObject({ code: 'PAYROLL_TIMESHEETS_PENDING' })
      expect((await db.timesheet.findUniqueOrThrow({ where: { employeeId_year_month: { employeeId, ...raceMonth } } })).status)
        .toBe('DRAFT')
    }
  })
})
