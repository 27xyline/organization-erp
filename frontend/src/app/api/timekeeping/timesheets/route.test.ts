import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), proxy: vi.fn() }))
vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/stage10', () => ({ proxyStage10Request: mocks.proxy }))

import { POST } from './route'

const user = { id: 'employee-1', sessionVersion: 2 }
const employeeId = `c${'a'.repeat(24)}`

describe('timesheets submit BFF route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({ user, requestId: 'request-10' })
    mocks.proxy.mockResolvedValue(new Response('{"data":{}}', { status: 201 }))
  })

  it('rejects invalid payloads and forwards valid submissions', async () => {
    const invalid = new Request('http://localhost/api/timekeeping/timesheets', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })
    expect((await POST(invalid as never)).status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const request = new Request('http://localhost/api/timekeeping/timesheets', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ employeeId, year: 2026, month: 10, zeroHoursConfirmed: true }),
    })
    expect((await POST(request as never)).status).toBe(201)
    expect(mocks.authorize).toHaveBeenCalledWith(request, 'timekeeping.timesheets.submit')
    expect(mocks.proxy).toHaveBeenCalledWith(
      request, '/api/timekeeping/timesheets', user, 'request-10',
    )
  })
})
