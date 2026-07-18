import { describe, expect, it, vi } from 'vitest'
import {
  ensureValidContractDateRange,
  ensureValidEmploymentRate,
} from '@/features/employees/domain/hr-domain'
import { resolveAssignablePosition } from '@/features/employees/infrastructure/employee.repository'

describe('hr-domain', () => {
  it('rejects non-positive employment rate', () => {
    expect(() => ensureValidEmploymentRate(0)).toThrowError('INVALID_EMPLOYMENT_RATE')
  })

  it('rejects invalid contract date range', () => {
    expect(() => ensureValidContractDateRange(new Date('2024-02-01'), new Date('2024-01-01'))).toThrowError('INVALID_CONTRACT_DATE_RANGE')
  })

  it('requires a position for active employee assignment', async () => {
    await expect(resolveAssignablePosition({} as never, {
      staffScheduleId: null,
      employmentRate: 1,
      status: 'ACTIVE',
    })).rejects.toMatchObject({ code: 'POSITION_REQUIRED' })
  })

  it('rejects missing position from staff schedule', async () => {
    const db = {
      staffSchedule: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      employee: {
        aggregate: vi.fn(),
      },
    }

    await expect(resolveAssignablePosition(db as never, {
      staffScheduleId: 'staff-1',
      employmentRate: 1,
      status: 'ACTIVE',
    })).rejects.toMatchObject({ code: 'POSITION_NOT_FOUND' })
  })

  it('rejects assignment when free rate is insufficient', async () => {
    const db = {
      staffSchedule: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'staff-1',
          rate: 1,
          departmentRef: { isActive: true },
        }),
      },
      employee: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { employmentRate: 0.75 } }),
      },
    }

    await expect(resolveAssignablePosition(db as never, {
      staffScheduleId: 'staff-1',
      employmentRate: 0.5,
      status: 'ACTIVE',
    })).rejects.toMatchObject({ code: 'INSUFFICIENT_POSITION_RATE' })
  })
})
