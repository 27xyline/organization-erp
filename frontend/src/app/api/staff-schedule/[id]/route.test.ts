import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(), proxy: vi.fn(), unavailable: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/transport', () => ({ proxyBackendRequest: mocks.proxy }))
vi.mock('@/lib/backend/client', () => ({ backendUnavailableResponse: mocks.unavailable }))

import { PUT } from './route'

describe('staff-schedule item BFF', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({
      user: { id: 'admin-1', sessionVersion: 1 },
      requestId: 'req-1',
    })
    mocks.proxy.mockResolvedValue(new Response(JSON.stringify({ data: { id: 'position-1' } }), { status: 200 }))
    mocks.unavailable.mockReturnValue(new Response(null, { status: 503 }))
  })

  it('forwards updates for authoritative Python scope checks', async () => {
    const req = new Request('http://localhost/api/staff-schedule/position-1', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ position: 'Инженер', departmentId: 'department-new', rate: 2, salary: 150000 }),
    }) as never
    const response = await PUT(req, { params: Promise.resolve({ id: 'position-1' }) })

    expect(mocks.authorize).toHaveBeenCalledWith(req, 'staffSchedule.update')
    expect(mocks.proxy).toHaveBeenCalledWith(
      req, '/api/staff-schedule/position-1', { id: 'admin-1', sessionVersion: 1 }, 'req-1',
    )
    expect(response.status).toBe(200)
  })
})
