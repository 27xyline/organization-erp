import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { hrError, resolveAssignablePosition } from '@/lib/services/hr-domain'
import { PersonnelActionService } from '@/lib/services/personnel-action.service'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/services/hr-domain', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/hr-domain')>('@/lib/services/hr-domain')

  return {
    ...actual,
    resolveAssignablePosition: vi.fn(actual.resolveAssignablePosition),
  }
})

describe('PersonnelActionService.createAction', () => {
  const employee = {
    id: 'emp-1',
    department: 'НИО',
    status: 'ACTIVE',
    contractSignedDate: new Date('2024-01-01'),
    contractEndDate: new Date('2024-12-31'),
    employmentRate: 1,
    staffScheduleId: 'staff-1',
    staffSchedule: {
      id: 'staff-1',
      position: 'Инженер',
      department: 'НИО',
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects invalid HIRE payload with non-positive rate', async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback({} as never))

    await expect(PersonnelActionService.createAction({
      type: 'HIRE',
      date: '2024-01-01',
      employeeData: {
        code: 'E001',
        fullName: 'Новый сотрудник',
        contractNumber: 'CN-1',
        contractSignedDate: '2024-01-01',
        staffScheduleId: 'staff-1',
        employmentRate: 0,
      },
    })).rejects.toMatchObject({ code: 'INVALID_EMPLOYMENT_RATE' })
  })

  it('rejects TRANSFER when target position has insufficient free rate', async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback({
      employee: {
        findUnique: vi.fn().mockResolvedValue(employee),
      },
    } as never))
    vi.mocked(resolveAssignablePosition).mockImplementationOnce(async () => {
      throw hrError('INSUFFICIENT_POSITION_RATE')
    })

    await expect(PersonnelActionService.createAction({
      type: 'TRANSFER',
      date: '2024-03-01',
      employeeId: employee.id,
      staffScheduleId: 'staff-2',
      employmentRate: 1.25,
    })).rejects.toMatchObject({ code: 'INSUFFICIENT_POSITION_RATE' })
  })

  it('rejects EXTEND without a new contract end date', async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback({
      employee: {
        findUnique: vi.fn().mockResolvedValue(employee),
      },
    } as never))

    await expect(PersonnelActionService.createAction({
      type: 'EXTEND',
      date: '2024-03-01',
      employeeId: employee.id,
    })).rejects.toMatchObject({ code: 'MISSING_CONTRACT_END_DATE' })
  })

  it('updates employee and writes action for valid PROMOTE payload', async () => {
    const updatedAction = { id: 'action-1', employee: { id: employee.id } }
    const tx = {
      employee: {
        findUnique: vi.fn().mockResolvedValue(employee),
        update: vi.fn().mockResolvedValue(null),
      },
      personnelAction: {
        create: vi.fn().mockResolvedValue(updatedAction),
      },
    }
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never))
    vi.mocked(resolveAssignablePosition).mockResolvedValueOnce({
      id: 'staff-2',
      position: 'Ведущий инженер',
      department: 'НИО',
    } as never)

    const result = await PersonnelActionService.createAction({
      type: 'PROMOTE',
      date: '2024-04-01',
      employeeId: employee.id,
      staffScheduleId: 'staff-2',
      employmentRate: 1,
      newDepartment: 'НИО',
    })

    expect(result).toEqual(updatedAction)
    expect(tx.personnelAction.create).toHaveBeenCalledTimes(1)
    expect(tx.employee.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: employee.id },
      data: expect.objectContaining({
        staffScheduleId: 'staff-2',
        employmentRate: 1,
      }),
    }))
  })

  it('dismisses employee and writes action for DISMISS payload', async () => {
    const dismissedAction = { id: 'action-dismiss', employee: { id: employee.id } }
    const tx = {
      employee: {
        findUnique: vi.fn().mockResolvedValue(employee),
        update: vi.fn().mockResolvedValue(null),
      },
      personnelAction: {
        create: vi.fn().mockResolvedValue(dismissedAction),
      },
    }
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never))

    const result = await PersonnelActionService.createAction({
      type: 'DISMISS',
      date: '2024-05-01',
      employeeId: employee.id,
      description: 'Уволен',
    })

    expect(result).toEqual(dismissedAction)
    expect(tx.personnelAction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'DISMISS',
        employeeId: employee.id,
        newDepartment: null,
        newPosition: null,
      }),
    }))
    expect(tx.employee.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: employee.id },
      data: expect.objectContaining({
        status: 'DISMISSED',
        staffScheduleId: employee.staffScheduleId,
        employmentRate: employee.employmentRate,
      }),
    }))
  })
})
