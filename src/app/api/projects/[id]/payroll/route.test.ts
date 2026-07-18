import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceError } from '@/lib/errors/service-error'

const authMocks = vi.hoisted(() => ({
  allows: vi.fn(() => true),
}))

vi.mock('@/lib/auth/authorization', () => ({
  AuthorizationError: class AuthorizationError extends Error {},
  authorizeApiRequest: vi.fn(async () => ({
    user: { id: 'admin-1', username: 'admin', name: 'Admin', role: 'ADMIN' },
    access: { allows: authMocks.allows },
    requestId: 'request-1',
  })),
}))

vi.mock('@/features/finance/application/project-payroll.service', async () => {
  const actual = await vi.importActual<typeof import('@/features/finance/application/project-payroll.service')>('@/features/finance/application/project-payroll.service')

  return {
    ...actual,
    ProjectPayrollService: {
      getTable: vi.fn(),
      saveCell: vi.fn(),
      clearCell: vi.fn(),
    },
  }
})

describe('projects/[id]/payroll route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 for invalid payroll year', async () => {
    const { GET } = await import('@/app/api/projects/[id]/payroll/route')

    const response = await GET(
      new NextRequest('http://localhost/api/projects/project-1/payroll?year=1900'),
      { params: Promise.resolve({ id: 'project-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Invalid payroll year' })
  })

  it('maps payroll service errors to api response', async () => {
    const { ProjectPayrollService } = await import('@/features/finance/application/project-payroll.service')
    const { PUT } = await import('@/app/api/projects/[id]/payroll/route')

    vi.mocked(ProjectPayrollService.saveCell).mockRejectedValueOnce(new ServiceError('INVALID_NADBAVKA_AMOUNT'))

    const response = await PUT(
      new Request('http://localhost/api/projects/project-1/payroll', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: 'emp-1',
          year: 2024,
          month: 1,
          okladEnabled: false,
          nadbavkaAmount: 'abc',
        }),
      }) as never,
      { params: Promise.resolve({ id: 'project-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Введите корректную сумму надбавки' })
  })
})
