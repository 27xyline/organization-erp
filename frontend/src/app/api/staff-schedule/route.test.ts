import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(), proxy: vi.fn(), unavailable: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/transport', () => ({ proxyBackendRequest: mocks.proxy }))
vi.mock('@/lib/backend/client', () => ({ backendUnavailableResponse: mocks.unavailable }))

import { POST } from './route'

describe('staff-schedule BFF', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({
      user: { id: 'admin-1', sessionVersion: 1 },
      requestId: 'req-1',
    })
    mocks.proxy.mockResolvedValue(new Response(JSON.stringify({ data: { id: 'position-1' } }), { status: 201 }))
    mocks.unavailable.mockReturnValue(new Response(null, { status: 503 }))
  })

  it('keeps input validation before Python forwarding', async () => {
    const invalid = await POST(new Request('http://localhost/api/staff-schedule', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
    }) as never)
    expect(invalid.status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const req = new Request('http://localhost/api/staff-schedule', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ position: 'Инженер', departmentId: 'department-1', rate: 1, salary: 100000 }),
    }) as never
    const response = await POST(req)
    expect(mocks.authorize).toHaveBeenCalledWith(req, 'staffSchedule.create')
    expect(mocks.proxy).toHaveBeenCalledWith(req, '/api/staff-schedule', { id: 'admin-1', sessionVersion: 1 }, 'req-1')
    expect(response.status).toBe(201)
  })
})
