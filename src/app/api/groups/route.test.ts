import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), proxy: vi.fn(), unavailable: vi.fn() }))

vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/bridge', () => ({ proxyBackendRequest: mocks.proxy }))
vi.mock('@/lib/backend/client', () => ({ backendUnavailableResponse: mocks.unavailable }))

import { NextRequest as RequestType } from 'next/server'
import { GET, POST } from './route'
import { DELETE, GET as getById, PUT } from './[id]/route'

const user = { id: 'actor-1', sessionVersion: 2 }
const groupInput = { code: 'G-1', name: 'Мебель', description: null }

function request(path: string, method = 'GET', body?: unknown) {
  return new RequestType(`http://localhost${path}`, {
    method,
    ...(body === undefined ? {} : {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  }) as NextRequest
}

describe('groups BFF', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({ user, requestId: 'request-1' })
    mocks.proxy.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }))
  })

  it('forwards list and item reads with their permission', async () => {
    const list = request('/api/groups')
    await GET(list)
    expect(mocks.authorize).toHaveBeenCalledWith(list, 'assetGroups.read')
    expect(mocks.proxy).toHaveBeenCalledWith(list, '/api/groups', user, 'request-1')

    const item = request('/api/groups/group-1')
    await getById(item, { params: Promise.resolve({ id: 'group-1' }) })
    expect(mocks.authorize).toHaveBeenCalledWith(item, 'assetGroups.read')
    expect(mocks.proxy).toHaveBeenCalledWith(item, '/api/groups/group-1', user, 'request-1')
  })

  it('validates creates and forwards group mutations to Python', async () => {
    const invalid = await POST(request('/api/groups', 'POST', { code: '', name: '' }))
    expect(invalid.status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const create = request('/api/groups', 'POST', groupInput)
    mocks.proxy.mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'group-1' } }), { status: 201 }))
    const created = await POST(create)
    expect(mocks.authorize).toHaveBeenLastCalledWith(create, 'assetGroups.create')
    expect(mocks.proxy).toHaveBeenLastCalledWith(create, '/api/groups', user, 'request-1')
    expect(created.status).toBe(201)

    const update = request('/api/groups/group-1', 'PUT', groupInput)
    await PUT(update, { params: Promise.resolve({ id: 'group-1' }) })
    expect(mocks.authorize).toHaveBeenLastCalledWith(update, 'assetGroups.update')
    expect(mocks.proxy).toHaveBeenLastCalledWith(update, '/api/groups/group-1', user, 'request-1')

    const remove = request('/api/groups/group-1', 'DELETE')
    await DELETE(remove, { params: Promise.resolve({ id: 'group-1' }) })
    expect(mocks.authorize).toHaveBeenLastCalledWith(remove, 'assetGroups.delete')
    expect(mocks.proxy).toHaveBeenLastCalledWith(remove, '/api/groups/group-1', user, 'request-1')
  })
})
