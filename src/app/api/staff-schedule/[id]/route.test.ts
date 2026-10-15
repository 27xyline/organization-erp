import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(), proxy: vi.fn(), unavailable: vi.fn(), allows: vi.fn(() => true),
  staffPositionTarget: vi.fn(), departmentForReference: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/auth/resource-scopes', () => ({
  staffPositionTarget: mocks.staffPositionTarget,
  departmentForReference: mocks.departmentForReference,
}))
vi.mock('@/lib/backend/bridge', () => ({ proxyBackendRequest: mocks.proxy }))
vi.mock('@/lib/backend/client', () => ({ backendUnavailableResponse: mocks.unavailable }))

import { PUT } from './route'

describe('staff-schedule item BFF', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({
      user: { id: 'admin-1', sessionVersion: 1 },
      access: { allows: mocks.allows },
      requestId: 'req-1',
    })
    mocks.allows.mockReturnValue(true)
    mocks.staffPositionTarget.mockResolvedValue({ departmentId: 'department-current' })
    mocks.departmentForReference.mockResolvedValue('department-new')
    mocks.proxy.mockResolvedValue(new Response(JSON.stringify({ data: { id: 'position-1' } }), { status: 200 }))
    mocks.unavailable.mockReturnValue(new Response(null, { status: 503 }))
  })

  it('checks both current and destination departments before forwarding updates', async () => {
    const req = new Request('http://localhost/api/staff-schedule/position-1', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ position: 'Инженер', departmentId: 'department-new', rate: 2, salary: 150000 }),
    }) as never
    const response = await PUT(req, { params: Promise.resolve({ id: 'position-1' }) })

    expect(mocks.authorize).toHaveBeenCalledWith(req, 'staffSchedule.update')
    expect(mocks.allows).toHaveBeenCalledWith('staffSchedule.update', {
      departmentIds: ['department-current', 'department-new'],
    })
    expect(mocks.proxy).toHaveBeenCalledWith(
      req, '/api/staff-schedule/position-1', { id: 'admin-1', sessionVersion: 1 }, 'req-1',
    )
    expect(response.status).toBe(200)
  })
})
