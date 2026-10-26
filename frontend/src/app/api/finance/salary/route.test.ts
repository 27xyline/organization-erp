import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), proxy: vi.fn() }))
vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/finance', () => ({ proxyFinanceRequest: mocks.proxy }))

import { GET } from './route'

describe('finance salary Payroll BFF route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({
      user: { id: 'accountant-1', sessionVersion: 3 },
      requestId: 'request-salary',
    })
    mocks.proxy.mockResolvedValue(new Response('{"data":{}}', { status: 200 }))
  })

  it('validates the year and forwards the salary table request', async () => {
    const invalid = new NextRequest('http://localhost/api/finance/salary?year=2200')
    expect((await GET(invalid)).status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const request = new NextRequest('http://localhost/api/finance/salary?year=2026')
    expect((await GET(request)).status).toBe(200)
    expect(mocks.authorize).toHaveBeenCalledWith(request, 'finance.salary.read')
    expect(mocks.proxy).toHaveBeenCalledWith(
      request, '/api/finance/salary?year=2026',
      { id: 'accountant-1', sessionVersion: 3 }, 'request-salary',
    )
  })
})
