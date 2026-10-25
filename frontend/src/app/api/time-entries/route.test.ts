import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), proxy: vi.fn() }))

vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/stage10', () => ({ proxyStage10Request: mocks.proxy }))

import { GET, POST } from './route'

const user = { id: 'employee-1', sessionVersion: 4 }
const cuid = `c${'a'.repeat(24)}`

describe('time-entries BFF route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({ user, requestId: 'request-10' })
    mocks.proxy.mockResolvedValue(new Response('{"data":{}}', { status: 200 }))
  })

  it('validates the month query and forwards the original query to FastAPI', async () => {
    const invalid = new NextRequest('http://localhost/api/time-entries?year=2026&month=13')
    expect((await GET(invalid)).status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const request = new NextRequest(
      `http://localhost/api/time-entries?year=2026&month=10&employeeId=${cuid}`,
    )
    const response = await GET(request)
    expect(mocks.authorize).toHaveBeenCalledWith(request, 'timekeeping.read')
    expect(mocks.proxy).toHaveBeenCalledWith(
      request,
      `/api/time-entries?year=2026&month=10&employeeId=${cuid}`,
      user,
      'request-10',
    )
    expect(response.status).toBe(200)
  })

  it('validates create input before forwarding it', async () => {
    const invalid = new NextRequest('http://localhost/api/time-entries', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })
    expect((await POST(invalid)).status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const request = new NextRequest('http://localhost/api/time-entries', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        employeeId: cuid, workDate: '2026-10-01', type: 'REGULAR', hours: 8,
      }),
    })
    mocks.proxy.mockResolvedValueOnce(new Response('{"data":{}}', { status: 201 }))
    const response = await POST(request)
    expect(mocks.authorize).toHaveBeenCalledWith(request, 'timekeeping.create')
    expect(mocks.proxy).toHaveBeenCalledWith(request, '/api/time-entries', user, 'request-10')
    expect(response.status).toBe(201)
  })
})
