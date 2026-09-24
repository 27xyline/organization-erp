import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ReportService } from './report.service'
import { getDb } from '@/lib/prisma'
import { AccessContext } from '@/lib/auth/access-context'

vi.mock('@/lib/prisma', () => {
  const mockDb = {
    personnelAction: {
      findMany: vi.fn(),
    },
    employee: {
      findMany: vi.fn(),
    },
    project: {
      findMany: vi.fn(),
    },
    asset: {
      findMany: vi.fn(),
    },
    operation: {
      findMany: vi.fn(),
    },
    vacation: {
      findMany: vi.fn(),
    },
    reportPreset: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    department: {
      findMany: vi.fn(),
    },
  }
  return {
    getDb: () => mockDb,
  }
})

describe('ReportService', () => {
  const db = getDb() as any
  const adminAccess = new AccessContext(
    {
      userId: 'admin-1',
      employeeId: 'employee-admin',
      employeeDepartmentId: 'department-1',
      memberProjectIds: [],
    },
    [{
      assignmentId: 'admin-assignment',
      role: 'ADMIN',
      departmentScopeMode: 'ALL',
      projectScopeMode: 'ALL',
      departmentIds: [],
      projectIds: [],
    }],
  )
  const accountantAccess = new AccessContext(
    {
      userId: 'manager-1',
      employeeId: 'employee-1',
      employeeDepartmentId: 'department-1',
      memberProjectIds: ['project-visible'],
    },
    [{
      assignmentId: 'assignment-1',
      role: 'ACCOUNTANT',
      departmentScopeMode: 'ASSIGNED',
      projectScopeMode: 'ASSIGNED',
      departmentIds: ['department-1'],
      projectIds: ['project-visible'],
    }],
  )
  const departmentHeadAccess = new AccessContext(
    {
      userId: 'department-head-1',
      employeeId: 'employee-1',
      employeeDepartmentId: 'department-1',
      memberProjectIds: ['project-visible'],
    },
    [{
      assignmentId: 'department-head-assignment',
      role: 'DEPARTMENT_HEAD',
      departmentScopeMode: 'ASSIGNED',
      projectScopeMode: 'ASSIGNED',
      departmentIds: ['department-1'],
      projectIds: ['project-visible'],
    }],
  )

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('calculates turnover rate correctly', async () => {
    db.personnelAction.findMany.mockResolvedValueOnce([{ employeeId: 'emp-1' }]) // dismissed
    db.personnelAction.findMany.mockResolvedValueOnce([{ employeeId: 'emp-2' }]) // hired

    db.employee.findMany.mockResolvedValueOnce([
      {
        id: 'emp-1',
        contractSignedDate: new Date('2026-01-01'),
        contractEndDate: new Date('2026-06-15'),
        actions: [
          { type: 'HIRE', date: new Date('2026-01-01') },
          { type: 'DISMISS', date: new Date('2026-06-15') },
        ],
      },
      {
        id: 'emp-2',
        contractSignedDate: new Date('2026-06-01'),
        actions: [{ type: 'HIRE', date: new Date('2026-06-01') }],
      },
      {
        id: 'emp-3',
        contractSignedDate: new Date('2025-01-01'),
        actions: [{ type: 'HIRE', date: new Date('2025-01-01') }],
      },
    ])

    const dateFrom = new Date('2026-01-01T00:00:00.000Z')
    const dateTo = new Date('2026-06-30T23:59:59.999Z')

    const result = await ReportService.getTurnoverReport(dateFrom, dateTo, undefined, adminAccess)

    expect(result.dismissedCount).toBe(1)
    expect(result.hiredCount).toBe(1)
    expect(result.activeAtStart).toBe(2)
    expect(result.activeAtEnd).toBe(2)
    expect(result.averageHeadcount).toBe(2)
    expect(result.turnoverRate).toBe(50.0)
  })

  it('calculates project profitability correctly', async () => {
    db.project.findMany.mockResolvedValueOnce([
      {
        id: 'proj-1',
        code: 'P01',
        name: 'Project 1',
        plannedBudget: 1000000,
        actualBudget: 800000,
        financePlanEntries: [
          { year: 2026, month: 1, amount: 50000 },
          { year: 2026, month: 2, amount: 60000 },
        ],
        procurementRequests: [
          { contract: { amount: 150000 } },
        ],
      },
    ])

    const dateFrom = new Date('2026-01-01T00:00:00.000Z')
    const dateTo = new Date('2026-02-28T23:59:59.999Z')

    const result = await ReportService.getProjectProfitability(dateFrom, dateTo, undefined, adminAccess)

    expect(result).toHaveLength(1)
    expect(result[0].payrollCost).toBe(110000)
    expect(result[0].procurementCost).toBe(150000)
    expect(result[0].totalCost).toBe(260000)
    expect(result[0].profit).toBe(540000)
    expect(result[0].profitabilityRate).toBe(67.5)
  })

  it('applies project scope even when a caller requests a specific project', async () => {
    db.project.findMany.mockResolvedValueOnce([])

    await ReportService.getProjectProfitability(
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-31T23:59:59.999Z'),
      'project-hidden',
      accountantAccess,
    )

    const query = db.project.findMany.mock.calls[0][0]
    expect(query.where).toEqual({
      AND: [
        { OR: [{ id: { in: ['project-visible'] } }] },
        { OR: [{ id: { in: ['project-visible'] } }] },
        { id: 'project-hidden' },
      ],
    })
  })

  it('scopes turnover actions and employees to the caller departments', async () => {
    db.personnelAction.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    db.employee.findMany.mockResolvedValueOnce([])

    await ReportService.getTurnoverReport(
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-31T23:59:59.999Z'),
      'department-hidden',
      departmentHeadAccess,
    )

    expect(db.personnelAction.findMany.mock.calls[0][0].where.employee).toEqual({
      AND: [
        { OR: [{ departmentId: { in: ['department-1'] } }] },
        { departmentId: 'department-hidden' },
      ],
    })
    expect(db.employee.findMany.mock.calls[0][0].where.AND).toEqual([
      { OR: [{ departmentId: { in: ['department-1'] } }] },
      { OR: [{ departmentId: { in: ['department-1'] } }] },
      { departmentId: 'department-hidden' },
    ])
  })

  it('scopes asset depreciation rows and movements to the caller access', async () => {
    db.asset.findMany.mockResolvedValueOnce([])
    db.operation.findMany.mockResolvedValueOnce([])

    await ReportService.getAssetDepreciationReport(
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-31T23:59:59.999Z'),
      'department-hidden',
      departmentHeadAccess,
    )

    expect(db.asset.findMany.mock.calls[0][0].where.AND).toEqual([
      { isArchived: false },
      departmentHeadAccess.assetWhere('assets.read'),
      { mol: { departmentId: 'department-hidden' } },
    ])
    expect(db.operation.findMany.mock.calls[0][0].where.AND).toContainEqual({
      asset: departmentHeadAccess.assetWhere('operations.read'),
    })
  })

  it('scopes vacation calendar records to the caller employee access', async () => {
    db.vacation.findMany.mockResolvedValueOnce([])

    await ReportService.getVacationCalendar(
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-31T23:59:59.999Z'),
      'department-hidden',
      departmentHeadAccess,
    )

    expect(db.vacation.findMany.mock.calls[0][0].where.AND).toEqual([
      {
        startDate: { lte: new Date('2026-01-31T23:59:59.999Z') },
        endDate: { gte: new Date('2026-01-01T00:00:00.000Z') },
      },
      { employee: { OR: [{ departmentId: { in: ['department-1'] } }] } },
      { employee: { departmentId: 'department-hidden' } },
    ])
  })

  it('scopes custom project report rows and each nested metric source', async () => {
    db.project.findMany.mockResolvedValueOnce([])

    await ReportService.getCustomReport(
      { name: 'Scoped project report', groupBy: 'project', metrics: ['projectBudget', 'actualFot', 'assetValue'] },
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-31T23:59:59.999Z'),
      undefined,
      undefined,
      accountantAccess,
    )

    const query = db.project.findMany.mock.calls[0][0]
    expect(query.where.AND).toEqual([
      accountantAccess.projectWhere('projects.read'),
      { status: 'ACTIVE' },
    ])
    expect(query.include.financePlanEntries.where).toEqual(
      accountantAccess.financeEntryWhere('finance.salary.read'),
    )
    expect(query.include.assets.where.AND).toEqual([
      { isArchived: false },
      accountantAccess.assetWhere('assets.read'),
    ])
  })

  it('scopes department salary metrics independently from headcount access', async () => {
    db.department.findMany.mockResolvedValueOnce([])
    db.employee.findMany.mockResolvedValueOnce([])

    await ReportService.getCustomReport(
      { name: 'Scoped department report', groupBy: 'department', metrics: ['plannedFot'] },
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-31T23:59:59.999Z'),
      undefined,
      undefined,
      accountantAccess,
    )

    expect(db.department.findMany.mock.calls[0][0].where.AND).toContainEqual(
      accountantAccess.departmentWhere('departments.read'),
    )
    expect(db.employee.findMany.mock.calls[0][0].where.AND).toContainEqual(
      accountantAccess.employeeWhere('finance.salary.read'),
    )
  })

  it('limits project payroll rows to the caller finance scope', async () => {
    db.project.findMany.mockResolvedValueOnce([])

    await ReportService.getProjectProfitability(
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-31T23:59:59.999Z'),
      undefined,
      accountantAccess,
    )

    const query = db.project.findMany.mock.calls[0][0]
    expect(query.select.financePlanEntries.where).toEqual({
      OR: [{
        AND: [
          { employee: { departmentId: { in: ['department-1'] } } },
          { projectId: { in: ['project-visible'] } },
        ],
      }],
    })
  })
})
