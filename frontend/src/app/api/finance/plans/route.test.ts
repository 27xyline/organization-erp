import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), proxy: vi.fn() }))
vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/finance', () => ({ proxyFinanceRequest: mocks.proxy }))

import { DELETE, GET, POST } from './route'

const user = { id: 'accountant-1', sessionVersion: 3 }

describe('finance plans Payroll BFF routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({ user, requestId: 'request-finance' })
    mocks.proxy.mockResolvedValue(new Response('{"data":{}}', { status: 200 }))
  })

  it('preserves invalid query and proxies supported finance aliases', async () => {
    const invalid = new NextRequest('http://localhost/api/finance/plans?type=salary&year=2026')
    expect((await GET(invalid)).status).toBe(400)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const request = new NextRequest('http://localhost/api/finance/plans?type=oklad&year=2026')
    expect((await GET(request)).status).toBe(200)
    expect(mocks.authorize).toHaveBeenCalledWith(request, 'financePlans.read')
    expect(mocks.proxy).toHaveBeenCalledWith(
      request, '/api/finance/plans?type=oklad&year=2026', user, 'request-finance',
    )
  })

  it('validates save and clear bodies before forwarding', async () => {
    const invalid = new Request('http://localhost/api/finance/plans', { method: 'POST', body: '{}' })
    expect((await POST(invalid as never)).status).toBe(400)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const validBody = {
      employeeId: 'employee-1', year: 2026, month: 3, type: 'nadbavka',
      allocations: [{ projectId: 'project-1', amount: '100.25' }],
    }
    const save = new Request('http://localhost/api/finance/plans', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(validBody),
    })
    expect((await POST(save as never)).status).toBe(200)
    expect(mocks.authorize).toHaveBeenCalledWith(save, {
      anyOf: ['financePlans.create', 'financePlans.update'],
    })
    expect(mocks.proxy).toHaveBeenCalledWith(save, '/api/finance/plans', user, 'request-finance')

    const clear = new Request('http://localhost/api/finance/plans', {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ employeeId: 'employee-1', year: 2026, month: 3, type: 'nadbavka' }),
    })
    expect((await DELETE(clear as never)).status).toBe(200)
    expect(mocks.authorize).toHaveBeenCalledWith(clear, 'financePlans.delete')
    expect(mocks.proxy).toHaveBeenCalledWith(clear, '/api/finance/plans', user, 'request-finance')
  })
})
