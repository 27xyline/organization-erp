import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { hrError } from '@/features/employees/domain/hr-domain'
import { resolveAssignablePosition } from '@/features/employees/infrastructure/employee.repository'
import { PersonnelActionService } from '@/features/employees/application/personnel-action.service'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}))

vi.mock('@/features/employees/infrastructure/employee.repository', async () => {
  const actual = await vi.importActual<typeof import('@/features/employees/infrastructure/employee.repository')>('@/features/employees/infrastructure/employee.repository')
  return { ...actual, resolveAssignablePosition: vi.fn(actual.resolveAssignablePosition) }
})

describe('PersonnelActionService.createAction', () => {
  const employee = {
    id: 'emp-1',
    department: 'НИО',
    departmentId: 'department-1',
    status: 'ACTIVE',
    contractSignedDate: new Date('2024-01-01'),
    contractEndDate: new Date('2024-12-31'),
    employmentRate: 1,
    staffScheduleId: 'staff-1',
    staffSchedule: {
      id: 'staff-1',
      position: 'Инженер',
      department: 'НИО',
      departmentId: 'department-1',
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects invalid HIRE payload with non-positive rate', async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback({
      $queryRaw: vi.fn().mockResolvedValue([{ lock: '' }]),
    } as never))

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
      $queryRaw: vi.fn().mockResolvedValue([{ lock: '' }]),
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
      $queryRaw: vi.fn().mockResolvedValue([{ lock: '' }]),
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
      $queryRaw: vi.fn().mockResolvedValue([{ lock: '' }]),
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
      departmentId: 'department-1',
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
      $queryRaw: vi.fn().mockResolvedValue([{ lock: '' }]),
      employee: {
        findUnique: vi.fn().mockResolvedValue(employee),
        update: vi.fn().mockResolvedValue(null),
      },
      personnelAction: {
        create: vi.fn().mockResolvedValue(dismissedAction),
      },
      department: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'department-1', code: 'DEP-1', name: 'НИО' },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    }
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never))

    const result = await PersonnelActionService.createAction({
      type: 'DISMISS',
      date: '2024-05-01',
      employeeId: employee.id,
      description: 'Уволен',
    }, 'admin-1', 'request-1')

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
    expect(tx.department.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['department-1'] } },
      data: { headEmployeeId: null },
    })
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        details: expect.objectContaining({
          clearedDepartmentHeads: [
            { id: 'department-1', code: 'DEP-1', name: 'НИО' },
          ],
        }),
      }),
    }))
    expect(tx.$queryRaw.mock.invocationCallOrder[0])
      .toBeLessThan(tx.employee.findUnique.mock.invocationCallOrder[0])
  })

  it('does not let a non-transfer action desynchronize the department snapshot', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ lock: '' }]),
      employee: {
        findUnique: vi.fn().mockResolvedValue(employee),
        update: vi.fn().mockResolvedValue(null),
      },
      personnelAction: {
        create: vi.fn().mockResolvedValue({ id: 'action-edit' }),
      },
    }
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never))

    await PersonnelActionService.createAction({
      type: 'EDIT',
      date: '2024-06-01',
      employeeId: employee.id,
      newDepartment: 'Произвольная строка',
    })

    expect(tx.employee.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        department: employee.department,
        departmentId: employee.departmentId,
      }),
    }))
    expect(tx.personnelAction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        newDepartment: employee.department,
      }),
    }))
  })
})
