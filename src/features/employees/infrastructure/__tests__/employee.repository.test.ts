import { describe, expect, it, vi } from 'vitest'
import { resolveAssignablePosition } from '../employee.repository'

const inactivePosition = {
  id: 'staff-inactive',
  position: 'Архивная должность',
  department: 'Закрытый отдел',
  departmentId: 'department-inactive',
  departmentRef: { isActive: false },
  rate: 1,
}

function createDb() {
  return {
    staffSchedule: {
      findUnique: vi.fn().mockResolvedValue(inactivePosition),
    },
    employee: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { employmentRate: 0 } }),
    },
  }
}

describe('resolveAssignablePosition', () => {
  it('rejects assigning a position from an inactive department', async () => {
    const db = createDb()

    await expect(resolveAssignablePosition(db as never, {
      staffScheduleId: inactivePosition.id,
      employmentRate: 0.5,
      status: 'ACTIVE',
    })).rejects.toMatchObject({ code: 'INACTIVE_POSITION_DEPARTMENT' })

    expect(db.employee.aggregate).not.toHaveBeenCalled()
  })

  it('allows preserving the current position from an inactive department', async () => {
    const db = createDb()

    const result = await resolveAssignablePosition(db as never, {
      staffScheduleId: inactivePosition.id,
      employeeId: 'employee-1',
      employmentRate: 0.5,
      status: 'ACTIVE',
      allowInactiveCurrentPosition: true,
    })

    expect(result).toEqual(inactivePosition)
    expect(db.employee.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { not: 'employee-1' },
      }),
    }))
  })
})
