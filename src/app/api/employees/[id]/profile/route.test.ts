import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(), proxy: vi.fn(), unavailable: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/transport', () => ({ proxyBackendRequest: mocks.proxy }))
vi.mock('@/lib/backend/client', () => ({ backendUnavailableResponse: mocks.unavailable }))

import { PUT } from './route'

describe('employee profile BFF', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({
      user: { id: 'hr-1', sessionVersion: 3 }, requestId: 'req-1',
    })
    mocks.proxy.mockResolvedValue(new Response(JSON.stringify({ data: { id: 'employee-1' } }), { status: 200 }))
    mocks.unavailable.mockReturnValue(new Response(null, { status: 503 }))
  })

  it('preserves manager visibility and replaces profile data only through the backend', async () => {
    const req = new Request('http://localhost/api/employees/employee-1/profile', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        birthDate: null, education: null, qualification: null, managerId: 'manager-1', skills: [], certificates: [],
      }),
    }) as never
    const response = await PUT(req, { params: Promise.resolve({ id: 'employee-1' }) })

    expect(mocks.authorize).toHaveBeenCalledWith(req, 'employees.update')
    expect(mocks.proxy).toHaveBeenCalledWith(req, '/api/employees/employee-1/profile', {
      id: 'hr-1', sessionVersion: 3,
    }, 'req-1')
    expect(response.status).toBe(200)
  })
})
