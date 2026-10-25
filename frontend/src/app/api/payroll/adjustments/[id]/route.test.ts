import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), proxy: vi.fn() }))
vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/stage10', () => ({ proxyStage10Request: mocks.proxy }))

import { DELETE } from './route'

describe('payroll adjustment Stage10 BFF route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({ user: { id: 'payroll-admin', sessionVersion: 1 }, requestId: 'request-adjustment' })
    mocks.proxy.mockResolvedValue(new Response('{"data":{"success":true}}', { status: 200 }))
  })

  it('authorizes and forwards deletion to Python', async () => {
    const request = new Request('http://localhost/api/payroll/adjustments/c123')
    expect((await DELETE(request as never, { params: Promise.resolve({ id: 'c123' }) })).status).toBe(200)
    expect(mocks.authorize).toHaveBeenCalledWith(request, 'payroll.manage')
    expect(mocks.proxy).toHaveBeenCalledWith(request, '/api/payroll/adjustments/c123', { id: 'payroll-admin', sessionVersion: 1 }, 'request-adjustment')
  })
})
