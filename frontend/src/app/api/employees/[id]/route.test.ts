import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  proxy: vi.fn(),
  unavailable: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/transport', () => ({ proxyBackendRequest: mocks.proxy }))
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
    mocks.authorize.mockResolvedValue({ user, requestId: 'req-1' })
    mocks.proxy.mockResolvedValue(new Response(JSON.stringify({ data: { id: 'employee-1' } }), { status: 200 }))
    mocks.unavailable.mockReturnValue(new Response(null, { status: 503 }))
  })

  it('validates updates then proxies to Python for authoritative scope checks', async () => {
    const invalid = await PUT(request('PUT', { employmentRate: -1 }), context)
    expect(invalid.status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const req = request('PUT', { department: 'Новое подразделение', employmentRate: 0.5 })
    const response = await PUT(req, context)
    expect(mocks.authorize).toHaveBeenCalledWith(req, 'employees.update')
    expect(mocks.proxy).toHaveBeenCalledWith(req, '/api/employees/employee-1', user, 'req-1')
    expect(response.status).toBe(200)
  })

  it('preserves Python resource-scope denials', async () => {
    mocks.proxy.mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
    const req = request('PUT', { employmentRate: 0.5 })
    const response = await PUT(req, context)

    expect(response.status).toBe(403)
    expect(mocks.proxy).toHaveBeenCalled()
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
