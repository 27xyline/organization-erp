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
})
