import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ReportService } from './report.service'
import { getDb } from '@/lib/prisma'

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

    const result = await ReportService.getTurnoverReport(dateFrom, dateTo)

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

    const result = await ReportService.getProjectProfitability(dateFrom, dateTo)

    expect(result).toHaveLength(1)
    expect(result[0].payrollCost).toBe(110000)
    expect(result[0].procurementCost).toBe(150000)
    expect(result[0].totalCost).toBe(260000)
    expect(result[0].profit).toBe(540000)
    expect(result[0].profitabilityRate).toBe(67.5)
  })
})
