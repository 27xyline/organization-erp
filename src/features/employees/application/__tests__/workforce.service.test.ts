import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/prisma'
import {
  WorkforceService,
  WorkforceServiceError,
} from '@/features/employees/application/workforce.service'

vi.mock('@/lib/prisma', () => ({
  getDb: vi.fn(),
}))

const input = {
  position: 'Инженер',
  departmentId: 'department-new',
  rate: 2,
  salary: 150000,
}

const before = {
  id: 'staff-1',
  position: 'Инженер',
  department: 'Старый отдел',
  departmentId: 'department-old',
  rate: 2,
  salary: 120000,
}

function createDb(overrides: {
  occupiedRate?: number
  department?: { id: string; name: string; isActive: boolean }
} = {}) {
  const occupiedRate = overrides.occupiedRate ?? 1
  const department = overrides.department ?? {
    id: 'department-new',
    name: 'Новый отдел',
    isActive: true,
  }
  const tx = {
    staffSchedule: {
      findUnique: vi.fn().mockResolvedValue({ rate: before.rate }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(before),
      update: vi.fn().mockResolvedValue({
        ...before,
        department: department.name,
        departmentId: department.id,
        salary: input.salary,
      }),
    },
    employee: {
      aggregate: vi.fn().mockResolvedValue({
        _sum: { employmentRate: occupiedRate },
      }),
    },
    department: {
      findUnique: vi.fn().mockResolvedValue(department),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  }
  const db = {
    $transaction: vi.fn(async (callback) => callback(tx)),
  }
  return { db, tx }
}

describe('WorkforceService.updatePosition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects changing the department of a position occupied by employees', async () => {
    const { db, tx } = createDb()
    vi.mocked(getDb).mockReturnValue(db as never)

    await expect(
      WorkforceService.updatePosition('staff-1', input, 'admin-1', 'request-1'),
    ).rejects.toEqual(new WorkforceServiceError('POSITION_DEPARTMENT_CHANGE_IN_USE'))

    expect(tx.staffSchedule.update).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('allows editing a position while preserving its inactive department', async () => {
    const inactiveDepartment = {
      id: before.departmentId,
      name: before.department,
      isActive: false,
    }
    const { db, tx } = createDb({ department: inactiveDepartment })
    vi.mocked(getDb).mockReturnValue(db as never)

    await WorkforceService.updatePosition('staff-1', {
      ...input,
      departmentId: before.departmentId,
    }, 'admin-1', 'request-1')

    expect(tx.staffSchedule.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        departmentId: before.departmentId,
        department: before.department,
      }),
    }))
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        details: {
          before: expect.objectContaining({
            departmentId: before.departmentId,
            department: before.department,
          }),
          after: expect.objectContaining({
            departmentId: before.departmentId,
            department: before.department,
          }),
        },
      }),
    }))
  })
})
