import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceError } from '@/lib/services/service-error'

vi.mock('@/lib/auth/authorization', () => ({
  authorizeApiRequest: vi.fn(async () => ({
    user: { id: 'admin-1', username: 'admin', name: 'Admin', role: 'ADMIN' },
  })),
}))

vi.mock('@/lib/services/finance-plan.service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/finance-plan.service')>('@/lib/services/finance-plan.service')

  return {
    ...actual,
    FinancePlanService: {
      getTable: vi.fn(),
      saveCell: vi.fn(),
      clearCell: vi.fn(),
    },
  }
})

describe('finance/plans route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 for invalid finance type query', async () => {
    const { GET } = await import('@/app/api/finance/plans/route')

    const response = await GET(new NextRequest('http://localhost/api/finance/plans?type=salary&year=2024'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Invalid finance plan type' })
  })

  it('maps finance service errors to preserved API messages', async () => {
    const { FinancePlanService } = await import('@/lib/services/finance-plan.service')
    const { POST } = await import('@/app/api/finance/plans/route')

    vi.mocked(FinancePlanService.saveCell).mockRejectedValueOnce(new ServiceError('PROJECT_REQUIRED'))

    const response = await POST(new Request('http://localhost/api/finance/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: 'emp-1',
        year: 2024,
        month: 1,
        type: 'oklad',
      }),
    }) as never)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Выберите проект' })
  })
})
