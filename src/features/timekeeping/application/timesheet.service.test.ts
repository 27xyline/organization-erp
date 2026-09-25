import { describe, expect, it, vi } from 'vitest'
import { TimesheetService } from './timesheet.service'

function makeAccess(options: {
  roles?: string[]
  employeeId?: string | null
  has?: (permission: string) => boolean
  allows?: (permission: string, target?: unknown) => boolean
} = {}) {
  return {
    identity: { userId: 'user-1', employeeId: options.employeeId ?? 'employee-1' },
    roles: options.roles || ['EMPLOYEE'],
    has: options.has || (() => true),
    allows: options.allows || (() => true),
  }
}

describe('TimesheetService.submit', () => {
  it('requires an explicit confirmation before submitting a zero-hour timesheet', async () => {
    const tx = {
      payrollPeriod: { upsert: vi.fn().mockResolvedValue({ id: 'period-1' }) },
      $queryRaw: vi.fn().mockResolvedValue([{ status: 'OPEN' }]),
      employee: { findUnique: vi.fn().mockResolvedValue({ id: 'employee-1', status: 'ACTIVE' }) },
      timeEntry: { count: vi.fn().mockResolvedValue(0) },
      timesheet: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
      auditLog: { create: vi.fn() },
    }
    const db = { $transaction: vi.fn((callback) => callback(tx)) }
    const access = makeAccess()

    await expect(new TimesheetService(db as never).submit({
      employeeId: 'employee-1',
      year: 2026,
      month: 8,
      zeroHoursConfirmed: false,
    }, 'user-1', 'employee-1', access as never)).rejects.toMatchObject({
      code: 'ZERO_HOURS_CONFIRMATION_REQUIRED',
    })

    expect(tx.timesheet.create).not.toHaveBeenCalled()
  })

  it('submits the sheet and audits an explicitly confirmed zero-hour month', async () => {
    const tx = {
      payrollPeriod: { upsert: vi.fn().mockResolvedValue({ id: 'period-1' }) },
      $queryRaw: vi.fn().mockResolvedValue([{ status: 'OPEN' }]),
      employee: { findUnique: vi.fn().mockResolvedValue({ id: 'employee-1', status: 'ACTIVE' }) },
      timeEntry: { count: vi.fn().mockResolvedValue(0) },
      timesheet: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'sheet-1', status: 'SUBMITTED' }),
      },
      auditLog: { create: vi.fn().mockResolvedValue(undefined) },
    }
    const db = { $transaction: vi.fn((callback) => callback(tx)) }

    await expect(new TimesheetService(db as never).submit({
      employeeId: 'employee-1',
      year: 2026,
      month: 8,
      zeroHoursConfirmed: true,
    }, 'user-1', 'employee-1', makeAccess() as never)).resolves.toMatchObject({
      id: 'sheet-1',
      status: 'SUBMITTED',
    })
    expect(tx.timesheet.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'SUBMITTED',
        zeroHoursConfirmed: true,
      }),
    }))
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'TIMESHEET_SUBMIT', entityId: 'sheet-1' }),
    }))
  })
})

describe('TimesheetService.decide', () => {
  function decisionDatabase(timesheet: object) {
    const tx = {
      payrollPeriod: { upsert: vi.fn().mockResolvedValue({ id: 'period-1' }) },
      $queryRaw: vi.fn().mockResolvedValue([{ status: 'OPEN' }]),
      timesheet: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({ year: 2026, month: 8 })
          .mockResolvedValueOnce(timesheet),
        update: vi.fn().mockResolvedValue({ id: 'sheet-1', status: 'APPROVED' }),
      },
      department: { findUnique: vi.fn() },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          isActive: true,
          employee: { status: 'ACTIVE', departmentId: 'department-1' },
          roleAssignments: [{
            role: 'DEPARTMENT_HEAD',
            departmentScopeMode: 'ASSIGNED',
            departmentScopes: [{ departmentId: 'department-1' }],
          }],
        }),
      },
      auditLog: { create: vi.fn().mockResolvedValue(undefined) },
    }
    return { tx, db: { $transaction: vi.fn((callback) => callback(tx)) } }
  }

  const submittedSheet = {
    id: 'sheet-1',
    employeeId: 'employee-1',
    year: 2026,
    month: 8,
    status: 'SUBMITTED',
    employee: {
      id: 'employee-1',
      departmentId: 'department-1',
      departmentRef: { id: 'department-1', parentId: null, headEmployeeId: 'head-1' },
    },
  }

  it('rejects a decision from someone who is not the target department head', async () => {
    const { tx, db } = decisionDatabase(submittedSheet)
    await expect(new TimesheetService(db as never).decide(
      'sheet-1', { decision: 'APPROVE' }, 'user-2', 'employee-2',
      makeAccess({ roles: ['DEPARTMENT_HEAD'], employeeId: 'employee-2' }) as never,
    )).rejects.toMatchObject({ code: 'TIMESHEET_DECISION_FORBIDDEN' })
    expect(tx.timesheet.update).not.toHaveBeenCalled()
  })

  it('requires a reason when HR approves without an assigned department head', async () => {
    const { tx, db } = decisionDatabase({
      ...submittedSheet,
      employee: {
        ...submittedSheet.employee,
        departmentRef: { id: 'department-1', parentId: null, headEmployeeId: null },
      },
    })
    await expect(new TimesheetService(db as never).decide(
      'sheet-1', { decision: 'APPROVE' }, 'hr-1', null,
      makeAccess({ roles: ['HR'], employeeId: null }) as never,
    )).rejects.toMatchObject({ code: 'APPROVAL_REASON_REQUIRED' })
    expect(tx.timesheet.update).not.toHaveBeenCalled()
  })

  it('allows HR fallback with an audit reason when the configured head has no reviewer account', async () => {
    const { tx, db } = decisionDatabase(submittedSheet)
    tx.user.findUnique.mockResolvedValue(null)
    await expect(new TimesheetService(db as never).decide(
      'sheet-1', { decision: 'APPROVE', reason: 'Руководитель не имеет доступа' }, 'hr-1', null,
      makeAccess({ roles: ['HR'], employeeId: null }) as never,
    )).resolves.toMatchObject({ status: 'APPROVED' })
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'TIMESHEET_APPROVE',
        details: expect.objectContaining({ approvalFallback: true }),
      }),
    }))
  })

  it('keeps HR fallback inside the actor department scope', async () => {
    const { tx, db } = decisionDatabase(submittedSheet)
    tx.user.findUnique.mockResolvedValue(null)
    await expect(new TimesheetService(db as never).decide(
      'sheet-1', { decision: 'APPROVE', reason: 'Нет доступного руководителя' }, 'hr-1', null,
      makeAccess({ roles: ['HR'], employeeId: null, allows: () => false }) as never,
    )).rejects.toMatchObject({ code: 'TIMESHEET_DECISION_FORBIDDEN' })
    expect(tx.timesheet.update).not.toHaveBeenCalled()
  })

  it('routes a department head timesheet to the nearest superior department head', async () => {
    const { tx, db } = decisionDatabase({
      ...submittedSheet,
      employeeId: 'head-1',
      employee: {
        ...submittedSheet.employee,
        id: 'head-1',
        departmentRef: { id: 'department-1', parentId: 'parent-1', headEmployeeId: 'head-1' },
      },
    })
    tx.department.findUnique.mockResolvedValue({ parentId: null, headEmployeeId: 'head-2' })
    await expect(new TimesheetService(db as never).decide(
      'sheet-1', { decision: 'APPROVE' }, 'user-2', 'head-2',
      makeAccess({
        roles: ['DEPARTMENT_HEAD'],
        employeeId: 'head-2',
        allows: () => true,
      }) as never,
    )).resolves.toMatchObject({ status: 'APPROVED' })
    expect(tx.department.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'parent-1' },
    }))
  })
})
