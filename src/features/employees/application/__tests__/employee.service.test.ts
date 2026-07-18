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

  it('clears department leadership and audits it when dismissing an employee', async () => {
    const updatedEmployee = { ...existingEmployee, status: 'DISMISSED' }
    const tx = {
      employee: {
        findUnique: vi.fn().mockResolvedValue(existingEmployee),
        update: vi.fn().mockResolvedValue(updatedEmployee),
      },
      department: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'department-old', code: 'DEP-OLD', name: 'Отдел' },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      personnelAction: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) => callback(tx as never))

    await EmployeeService.dismissEmployee('emp-1', 'admin-1', 'request-1')

    expect(tx.department.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['department-old'] } },
      data: { headEmployeeId: null },
    })
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'EMPLOYEE_DISMISS',
        details: expect.objectContaining({
          clearedDepartmentHeads: [
            { id: 'department-old', code: 'DEP-OLD', name: 'Отдел' },
          ],
        }),
      }),
    }))
  })

  it('does not reactivate a dismissed employee in an inactive department', async () => {
    const dismissedEmployee = {
      ...existingEmployee,
      status: 'DISMISSED',
    }
    const employeeUpdate = vi.fn()
    const tx = {
      employee: {
        findUnique: vi.fn().mockResolvedValue(dismissedEmployee),
        update: employeeUpdate,
        aggregate: vi.fn(),
      },
      staffSchedule: {
        findUnique: vi.fn().mockResolvedValue({
          ...dismissedEmployee.staffSchedule,
          rate: 1,
          departmentRef: { isActive: false },
        }),
      },
    }
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) => callback(tx as never))

    await expect(EmployeeService.updateEmployee('emp-1', {
      status: 'ACTIVE',
    })).rejects.toMatchObject({ code: 'INACTIVE_POSITION_DEPARTMENT' })

    expect(employeeUpdate).not.toHaveBeenCalled()
    expect(tx.employee.aggregate).not.toHaveBeenCalled()
  })
})
