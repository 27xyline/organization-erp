import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), proxy: vi.fn() }))
vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/stage10', () => ({ proxyStage10Request: mocks.proxy }))

import { PUT } from './route'

describe('payroll period Stage10 BFF route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({ user: { id: 'payroll-admin', sessionVersion: 1 }, requestId: 'request-period' })
    mocks.proxy.mockResolvedValue(new Response('{"data":{}}', { status: 200 }))
  })

  it('validates close/reopen payloads and proxies to the Python period service', async () => {
    const invalid = new Request('http://localhost/api/payroll/period', { method: 'PUT', body: '{}' })
    expect((await PUT(invalid as never)).status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const request = new Request('http://localhost/api/payroll/period', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ year: 2026, month: 10, status: 'CLOSED' }),
    })
    expect((await PUT(request as never)).status).toBe(200)
    expect(mocks.authorize).toHaveBeenCalledWith(request, 'payroll.close')
    expect(mocks.proxy).toHaveBeenCalledWith(request, '/api/payroll/period', { id: 'payroll-admin', sessionVersion: 1 }, 'request-period')
  })
})
