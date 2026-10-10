import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  proxy: vi.fn(),
  unavailable: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/bridge', () => ({ proxyBackendRequest: mocks.proxy }))
vi.mock('@/lib/backend/client', () => ({ backendUnavailableResponse: mocks.unavailable }))

import { GET, POST } from './route'
import { PATCH, DELETE } from './[id]/route'

const user = { id: 'actor-1', sessionVersion: 2 }

function request(path: string, method = 'GET', body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    ...(body === undefined ? {} : {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  })
}

describe('departments BFF', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({ user, access: { allows: () => true }, requestId: 'request-1' })
    mocks.proxy.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }))
  })

  it('forwards list query and permission to the Python owner', async () => {
    const req = request('/api/departments?activeOnly=true')
    await GET(req)
    expect(mocks.authorize).toHaveBeenCalledWith(req, 'departments.read')
    expect(mocks.proxy).toHaveBeenCalledWith(req, '/api/departments?activeOnly=true', user, 'request-1')
  })

  it('validates creates and forwards valid creates without changing their 201 response', async () => {
    const invalid = await POST(request('/api/departments', 'POST', { code: '', name: '' }))
    expect(invalid.status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const req = request('/api/departments', 'POST', { code: 'D-1', name: 'Отдел' })
    mocks.proxy.mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'department-1' } }), { status: 201 }))
    const response = await POST(req)
    expect(mocks.authorize).toHaveBeenLastCalledWith(req, 'departments.create')
    expect(mocks.proxy).toHaveBeenLastCalledWith(req, '/api/departments', user, 'request-1')
    expect(response.status).toBe(201)
  })

  it('delegates scoped update and delete checks to the Python owner', async () => {
    const update = request('/api/departments/department-1', 'PATCH', { name: 'Новое имя' })
    await PATCH(update, { params: Promise.resolve({ id: 'department-1' }) })
    expect(mocks.authorize).toHaveBeenCalledWith(update, 'departments.update')
    expect(mocks.proxy).toHaveBeenCalledWith(update, '/api/departments/department-1', user, 'request-1')

    const remove = request('/api/departments/department-1', 'DELETE')
    await DELETE(remove, { params: Promise.resolve({ id: 'department-1' }) })
    expect(mocks.authorize).toHaveBeenCalledWith(remove, 'departments.delete')
    expect(mocks.proxy).toHaveBeenCalledWith(remove, '/api/departments/department-1', user, 'request-1')
  })
})
