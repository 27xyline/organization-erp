import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(), proxy: vi.fn(), unavailable: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/transport', () => ({ proxyBackendRequest: mocks.proxy }))
vi.mock('@/lib/backend/client', () => ({ backendUnavailableResponse: mocks.unavailable }))

import { DELETE } from './[id]/route'
import { POST as sync } from './sync/route'
import { GET, POST } from './route'

describe('personnel action BFF', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({
      user: { id: 'hr-1', sessionVersion: 1 }, requestId: 'req-1',
    })
    mocks.proxy.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }))
    mocks.unavailable.mockReturnValue(new Response(null, { status: 503 }))
  })

  it('validates filters and forwards list queries to Python', async () => {
    const req = new NextRequest('http://localhost/api/personnel-actions?page=2&limit=20')
    await GET(req)
    expect(mocks.authorize).toHaveBeenCalledWith(req, 'personnelActions.read')
    expect(mocks.proxy).toHaveBeenCalledWith(req, '/api/personnel-actions?page=2&limit=20', {
      id: 'hr-1', sessionVersion: 1,
    }, 'req-1')
  })

  it('forwards validated actions for authoritative Python scope checks', async () => {
    const req = new NextRequest('http://localhost/api/personnel-actions', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'TRANSFER', employeeId: 'employee-1', date: '2026-10-01' }),
    })
    mocks.proxy.mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'action-1' } }), { status: 201 }))
    const response = await POST(req)
    expect(mocks.authorize).toHaveBeenCalledWith(req, 'personnelActions.create')
    expect(mocks.proxy).toHaveBeenCalledWith(req, '/api/personnel-actions', {
      id: 'hr-1', sessionVersion: 1,
    }, 'req-1')
    expect(response.status).toBe(201)
  })

  it('preserves sync authorization and forwards sync without TypeScript writers', async () => {
    const req = new NextRequest('http://localhost/api/personnel-actions/sync', { method: 'POST' })
    const response = await sync(req)
    expect(mocks.authorize).toHaveBeenCalledWith(req, 'personnelActions.sync')
    expect(mocks.proxy).toHaveBeenCalledWith(req, '/api/personnel-actions/sync', {
      id: 'hr-1', sessionVersion: 1,
    }, 'req-1')
    expect(response.status).toBe(200)
  })

  it('forwards deletes for authoritative Python scope checks', async () => {
    const req = new NextRequest('http://localhost/api/personnel-actions/action-1', { method: 'DELETE' })
    await DELETE(req, { params: Promise.resolve({ id: 'action-1' }) })
    expect(mocks.authorize).toHaveBeenCalledWith(req, 'personnelActions.delete')
    expect(mocks.proxy).toHaveBeenCalledWith(req, '/api/personnel-actions/action-1', {
      id: 'hr-1', sessionVersion: 1,
    }, 'req-1')
  })
})
