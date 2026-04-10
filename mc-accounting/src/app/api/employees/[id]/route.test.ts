import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceError } from '@/lib/services/service-error'

vi.mock('@/lib/services/employee.service', () => ({
  EmployeeService: {
    updateEmployee: vi.fn(),
    dismissEmployee: vi.fn(),
  },
}))

vi.mock('@prisma/client', async () => {
  const actual = await vi.importActual<typeof import('@prisma/client')>('@prisma/client')

  class PrismaClientKnownRequestError extends Error {
    code: string
    meta?: Record<string, unknown>

    constructor(code: string, meta?: Record<string, unknown>) {
      super(code)
      this.code = code
      this.meta = meta
    }
  }

  return {
    ...actual,
    Prisma: {
      ...actual.Prisma,
      PrismaClientKnownRequestError,
    },
  }
})

describe('employees/[id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps domain position requirement errors to HTTP 400', async () => {
    const { EmployeeService } = await import('@/lib/services/employee.service')
    const { PUT } = await import('@/app/api/employees/[id]/route')

    vi.mocked(EmployeeService.updateEmployee).mockRejectedValueOnce(new ServiceError('POSITION_REQUIRED'))

    const request = new Request('http://localhost/api/employees/emp-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'E001',
      }),
    })

    const response = await PUT(request as never, { params: { id: 'emp-1' } })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Должность из штатного расписания обязательна' })
  })

  it('maps duplicate employee code errors to HTTP 400', async () => {
    const { EmployeeService } = await import('@/lib/services/employee.service')
    const { Prisma } = await import('@prisma/client')
    const { PUT } = await import('@/app/api/employees/[id]/route')

    vi.mocked(EmployeeService.updateEmployee).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('P2002', { target: ['code'] } as any)
    )

    const request = new Request('http://localhost/api/employees/emp-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'E001',
      }),
    })

    const response = await PUT(request as never, { params: { id: 'emp-1' } })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Сотрудник с таким табельным номером уже существует' })
  })
})
