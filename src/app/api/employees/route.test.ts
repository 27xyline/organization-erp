import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(), proxy: vi.fn(), unavailable: vi.fn(), allows: vi.fn(() => true),
  departmentForPosition: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/auth/resource-scopes', () => ({ departmentForPosition: mocks.departmentForPosition }))
vi.mock('@/lib/backend/bridge', () => ({ proxyBackendRequest: mocks.proxy }))
vi.mock('@/lib/backend/client', () => ({ backendUnavailableResponse: mocks.unavailable }))

import { GET, POST } from './route'

const user = { id: 'hr-1', sessionVersion: 2 }

describe('employees collection BFF', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({ user, access: { allows: mocks.allows }, requestId: 'req-1' })
    mocks.allows.mockReturnValue(true)
    mocks.departmentForPosition.mockResolvedValue('department-1')
    mocks.proxy.mockResolvedValue(new Response(JSON.stringify({ data: [], pagination: { page: 2 } }), { status: 200 }))
    mocks.unavailable.mockReturnValue(new Response(null, { status: 503 }))
  })

  it('validates list filters and forwards the original page and limit query', async () => {
    const invalid = await GET(new NextRequest('http://localhost/api/employees?page=0'))
    expect(invalid.status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const req = new NextRequest('http://localhost/api/employees?scope=archive&page=2&limit=25')
    const response = await GET(req)
    expect(mocks.authorize).toHaveBeenCalledWith(req, 'employees.read')
    expect(mocks.proxy).toHaveBeenCalledWith(req, '/api/employees?scope=archive&page=2&limit=25', user, 'req-1')
    expect(response.status).toBe(200)
  })

  it('validates create input and checks the target position scope before forwarding', async () => {
    const invalid = await POST(new NextRequest('http://localhost/api/employees', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: '', fullName: '' }),
    }))
    expect(invalid.status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const req = new NextRequest('http://localhost/api/employees', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code: 'E-1', fullName: 'E2E Employee', contractSignedDate: '2026-01-01',
        contractNumber: 'C-1', staffScheduleId: 'position-1', employmentRate: 1,
      }),
    })
    mocks.proxy.mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'employee-1' } }), { status: 201 }))
    const response = await POST(req)
    expect(mocks.authorize).toHaveBeenCalledWith(req, 'employees.create')
    expect(mocks.allows).toHaveBeenCalledWith('employees.create', { departmentId: 'department-1' })
    expect(mocks.proxy).toHaveBeenCalledWith(req, '/api/employees', user, 'req-1')
    expect(response.status).toBe(201)
  })
})
