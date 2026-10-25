import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), proxy: vi.fn() }))
vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/finance', () => ({ proxyFinanceRequest: mocks.proxy }))

import { GET, POST } from './route'

const user = { id: 'payroll-admin', sessionVersion: 1 }

describe('payroll Payroll BFF routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({ user, requestId: 'request-payroll' })
    mocks.proxy.mockResolvedValue(new Response('{"data":{}}', { status: 200 }))
  })

  it('validates month aliases and proxies the Python payroll query', async () => {
    const invalid = new NextRequest('http://localhost/api/payroll?year=2026&month=13')
    expect((await GET(invalid)).status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const request = new NextRequest('http://localhost/api/payroll?year=2026&month=10')
    expect((await GET(request)).status).toBe(200)
    expect(mocks.authorize).toHaveBeenCalledWith(request, 'payroll.read')
    expect(mocks.proxy).toHaveBeenCalledWith(request, '/api/payroll?year=2026&month=10', user, 'request-payroll')
  })

  it('validates payroll adjustments before forwarding to Python', async () => {
    const invalid = new Request('http://localhost/api/payroll', { method: 'POST', body: '{}' })
    expect((await POST(invalid as never)).status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const body = {
      employeeId: `c${'1'.repeat(24)}`, year: 2026, month: 10,
      type: 'BONUS', amount: 100, description: 'Annual bonus',
    }
    const request = new Request('http://localhost/api/payroll', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    expect((await POST(request as never)).status).toBe(200)
    expect(mocks.authorize).toHaveBeenCalledWith(request, 'payroll.manage')
    expect(mocks.proxy).toHaveBeenCalledWith(request, '/api/payroll', user, 'request-payroll')
  })
})
