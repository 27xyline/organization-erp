import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { EmployeeService } from '@/features/employees/application/employee.service'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}))

describe('EmployeeService.updateEmployee', () => {
  const existingEmployee = {
    id: 'emp-1',
    code: 'E001',
    fullName: 'Тестовый Сотрудник',
    department: 'Отдел',
    departmentId: 'department-old',
    contractType: 'PRIMARY',
    contractSignedDate: new Date('2024-01-01'),
    contractEndDate: new Date('2024-12-31'),
    contractNumber: '42',
    status: 'ACTIVE',
    staffScheduleId: 'staff-1',
    employmentRate: 1,
    staffSchedule: {
      id: 'staff-1',
      position: 'Инженер',
      department: 'Отдел',
      departmentId: 'department-old',
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback({
      employee: {
        findUnique: vi.fn().mockResolvedValue(existingEmployee),
      },
    } as never))
  })

  it('rejects invalid employment rate before DB mutation', async () => {
    await expect(EmployeeService.updateEmployee('emp-1', {
      employmentRate: 0,
    })).rejects.toMatchObject({ code: 'INVALID_EMPLOYMENT_RATE' })
  })

  it('rejects invalid contract date range before DB mutation', async () => {
    await expect(EmployeeService.updateEmployee('emp-1', {
      contractSignedDate: new Date('2024-08-01'),
      contractEndDate: new Date('2024-07-01'),
    })).rejects.toMatchObject({ code: 'INVALID_CONTRACT_DATE_RANGE' })
  })

  it('updates the relation and legacy snapshot together for a direct department edit', async () => {
    const dismissedEmployee = {
      ...existingEmployee,
      status: 'DISMISSED',
      staffScheduleId: null,
      staffSchedule: null,
    }
    const employeeUpdate = vi.fn().mockResolvedValue({
      ...dismissedEmployee,
      department: 'Исследовательский отдел',
      departmentId: 'department-new',
    })
    const tx = {
      employee: {
        findUnique: vi.fn().mockResolvedValue(dismissedEmployee),
        update: employeeUpdate,
      },
      department: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'department-new',
          name: 'Исследовательский отдел',
          isActive: true,
        }),
      },
      personnelAction: { create: vi.fn().mockResolvedValue({}) },
    }
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) => callback(tx as never))

    await EmployeeService.updateEmployee('emp-1', {
      department: 'исследовательский ОТДЕЛ',
    })

    expect(employeeUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        department: 'Исследовательский отдел',
        departmentId: 'department-new',
      }),
    }))
  })
})
