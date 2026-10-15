import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  proxy: vi.fn(),
  unavailable: vi.fn(),
  allows: vi.fn(() => true),
  employeeTarget: vi.fn(),
  departmentForPosition: vi.fn(),
  departmentByName: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/auth/resource-scopes', () => ({
  employeeTarget: mocks.employeeTarget,
  departmentForPosition: mocks.departmentForPosition,
  departmentByName: mocks.departmentByName,
}))
vi.mock('@/lib/backend/bridge', () => ({ proxyBackendRequest: mocks.proxy }))
vi.mock('@/lib/backend/client', () => ({ backendUnavailableResponse: mocks.unavailable }))

import { DELETE, PUT } from './route'

const user = { id: 'admin-1', sessionVersion: 4 }
const context = { params: Promise.resolve({ id: 'employee-1' }) }

function request(method: string, body?: unknown) {
  return new Request('http://localhost/api/employees/employee-1', {
    method,
    ...(body === undefined ? {} : {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  }) as never
}

describe('employees/[id] BFF', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({ user, access: { allows: mocks.allows }, requestId: 'req-1' })
    mocks.allows.mockReturnValue(true)
    mocks.employeeTarget.mockResolvedValue({ employeeId: 'employee-1', departmentId: 'department-1' })
    mocks.departmentForPosition.mockResolvedValue(null)
    mocks.departmentByName.mockResolvedValue(null)
    mocks.proxy.mockResolvedValue(new Response(JSON.stringify({ data: { id: 'employee-1' } }), { status: 200 }))
    mocks.unavailable.mockReturnValue(new Response(null, { status: 503 }))
  })

  it('validates updates, checks current and destination scopes, then proxies to Python', async () => {
    const invalid = await PUT(request('PUT', { employmentRate: -1 }), context)
    expect(invalid.status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const req = request('PUT', { department: 'Новое подразделение', employmentRate: 0.5 })
    const response = await PUT(req, context)
    expect(mocks.authorize).toHaveBeenCalledWith(req, 'employees.update')
    expect(mocks.allows).toHaveBeenCalledWith('employees.update', {
      employeeId: 'employee-1',
      departmentIds: ['department-1'],
    })
    expect(mocks.proxy).toHaveBeenCalledWith(req, '/api/employees/employee-1', user, 'req-1')
    expect(response.status).toBe(200)
  })

  it('keeps out-of-scope employees blocked before forwarding', async () => {
    mocks.allows.mockReturnValue(false)
    const req = request('PUT', { employmentRate: 0.5 })
    const response = await PUT(req, context)

    expect(response.status).toBe(403)
    expect(mocks.proxy).not.toHaveBeenCalled()
  })

  it('forwards dismissal and preserves Python response status', async () => {
    const req = request('DELETE')
    mocks.proxy.mockResolvedValueOnce(new Response(JSON.stringify({ data: { archived: true } }), { status: 200 }))
    const response = await DELETE(req, context)

    expect(mocks.authorize).toHaveBeenCalledWith(req, 'employees.delete')
    expect(mocks.proxy).toHaveBeenCalledWith(req, '/api/employees/employee-1', user, 'req-1')
    expect(response.status).toBe(200)
  })
})
