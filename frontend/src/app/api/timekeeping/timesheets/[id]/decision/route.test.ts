import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), proxy: vi.fn() }))
vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/stage10', () => ({ proxyStage10Request: mocks.proxy }))

import { POST } from './route'

const user = { id: 'reviewer-1', sessionVersion: 3 }
const params = { params: Promise.resolve({ id: 'timesheet-1' }) }

describe('timesheet decision BFF route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({ user, requestId: 'request-10' })
    mocks.proxy.mockResolvedValue(new Response('{"data":{}}', { status: 200 }))
  })

  it('validates decisions and forwards them to FastAPI', async () => {
    const invalid = new Request('http://localhost/api/timekeeping/timesheets/timesheet-1/decision', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: '{"decision":"RETURN"}',
    })
    expect((await POST(invalid as never, params)).status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const request = new Request('http://localhost/api/timekeeping/timesheets/timesheet-1/decision', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: '{"decision":"RETURN","reason":"Исправить часы"}',
    })
    expect((await POST(request as never, params)).status).toBe(200)
    expect(mocks.authorize).toHaveBeenCalledWith(request, 'timekeeping.timesheets.review')
    expect(mocks.proxy).toHaveBeenCalledWith(
      request, '/api/timekeeping/timesheets/timesheet-1/decision', user, 'request-10',
    )
  })
})
