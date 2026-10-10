import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), proxy: vi.fn(), unavailable: vi.fn() }))

vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/bridge', () => ({ proxyBackendRequest: mocks.proxy }))
vi.mock('@/lib/backend/client', () => ({ backendUnavailableResponse: mocks.unavailable }))

import { GET, POST } from './route'
import { DELETE, GET as getById, PUT } from './[id]/route'

const user = { id: 'actor-1', sessionVersion: 2 }
const molInput = {
  code: 'M-1',
  department: 'Отдел',
  departmentId: 'department-1',
  fullName: 'Иванов Иван Иванович',
  storageLocation: 'Кабинет 1',
  photo: '',
}

function request(path: string, method = 'GET', body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    ...(body === undefined ? {} : {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  })
}

describe('MOL BFF', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({ user, requestId: 'request-1' })
    mocks.proxy.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }))
  })

  it('forwards scoped collection and item reads to Python', async () => {
    const list = request('/api/mols')
    await GET(list)
    expect(mocks.authorize).toHaveBeenCalledWith(list, 'mols.read')
    expect(mocks.proxy).toHaveBeenCalledWith(list, '/api/mols', user, 'request-1')

    const item = request('/api/mols/mol-1')
    await getById(item, { params: Promise.resolve({ id: 'mol-1' }) })
    expect(mocks.proxy).toHaveBeenCalledWith(item, '/api/mols/mol-1', user, 'request-1')
  })

  it('validates creates and delegates department-scope checks with mutations', async () => {
    const invalid = await POST(request('/api/mols', 'POST', { ...molInput, departmentId: '' }))
    expect(invalid.status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const create = request('/api/mols', 'POST', molInput)
    mocks.proxy.mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'mol-1' } }), { status: 201 }))
    const created = await POST(create)
    expect(mocks.authorize).toHaveBeenLastCalledWith(create, 'mols.create')
    expect(mocks.proxy).toHaveBeenLastCalledWith(create, '/api/mols', user, 'request-1')
    expect(created.status).toBe(201)

    const update = request('/api/mols/mol-1', 'PUT', molInput)
    await PUT(update, { params: Promise.resolve({ id: 'mol-1' }) })
    expect(mocks.authorize).toHaveBeenLastCalledWith(update, 'mols.update')
    expect(mocks.proxy).toHaveBeenLastCalledWith(update, '/api/mols/mol-1', user, 'request-1')

    const remove = request('/api/mols/mol-1', 'DELETE')
    await DELETE(remove, { params: Promise.resolve({ id: 'mol-1' }) })
    expect(mocks.authorize).toHaveBeenLastCalledWith(remove, 'mols.delete')
    expect(mocks.proxy).toHaveBeenLastCalledWith(remove, '/api/mols/mol-1', user, 'request-1')
  })
})
