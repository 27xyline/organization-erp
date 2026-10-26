import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), proxy: vi.fn() }))
vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/finance', () => ({ proxyFinanceRequest: mocks.proxy }))

import { DELETE, PUT } from './route'

const user = { id: 'admin-1', sessionVersion: 1 }
const params = { params: Promise.resolve({ id: 'time-entry-1' }) }

describe('time-entry item BFF route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({ user, requestId: 'request-10' })
    mocks.proxy.mockResolvedValue(new Response('{"data":{}}', { status: 200 }))
  })

  it('validates updates and forwards them to the backend', async () => {
    const invalid = new Request('http://localhost/api/time-entries/time-entry-1', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{"hours":0}',
    })
    expect((await PUT(invalid as never, params)).status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const request = new Request('http://localhost/api/time-entries/time-entry-1', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{"hours":3}',
    })
    expect((await PUT(request as never, params)).status).toBe(200)
    expect(mocks.proxy).toHaveBeenCalledWith(
      request, '/api/time-entries/time-entry-1', user, 'request-10',
    )
  })

  it('validates delete correction reasons before forwarding', async () => {
    const invalid = new Request('http://localhost/api/time-entries/time-entry-1', {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: '{"correctionReason":null}',
    })
    expect((await DELETE(invalid as never, params)).status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const request = new Request('http://localhost/api/time-entries/time-entry-1', {
      method: 'DELETE', headers: { 'content-type': 'application/json' }, body: '{}',
    })
    expect((await DELETE(request as never, params)).status).toBe(200)
    expect(mocks.proxy).toHaveBeenCalledWith(
      request, '/api/time-entries/time-entry-1', user, 'request-10',
    )
  })
})
