import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(), proxy: vi.fn(), unavailable: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/transport', () => ({ proxyBackendRequest: mocks.proxy }))
vi.mock('@/lib/backend/client', () => ({ backendUnavailableResponse: mocks.unavailable }))

import { DELETE, PUT } from './[id]/route'
import { GET, POST } from './route'

describe('vacation BFF', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({
      user: { id: 'hr-1', sessionVersion: 1 }, requestId: 'req-1',
    })
    mocks.proxy.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }))
    mocks.unavailable.mockReturnValue(new Response(null, { status: 503 }))
  })

  it('validates the requested calendar year and forwards the exact year', async () => {
    const invalid = await GET(new NextRequest('http://localhost/api/vacations?year=1800'))
    expect(invalid.status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const req = new NextRequest('http://localhost/api/vacations?year=2026')
    await GET(req)
    expect(mocks.authorize).toHaveBeenCalledWith(req, 'vacations.read')
    expect(mocks.proxy).toHaveBeenCalledWith(req, '/api/vacations?year=2026', {
      id: 'hr-1', sessionVersion: 1,
    }, 'req-1')
  })

  it('forwards validated vacation creates for authoritative Python scope checks', async () => {
    const req = new NextRequest('http://localhost/api/vacations', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ employeeId: 'employee-1', startDate: '2026-11-01', endDate: '2026-11-10' }),
    })
    mocks.proxy.mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'vacation-1' } }), { status: 201 }))
    const response = await POST(req)
    expect(mocks.proxy).toHaveBeenCalledWith(req, '/api/vacations', {
      id: 'hr-1', sessionVersion: 1,
    }, 'req-1')
    expect(response.status).toBe(201)
  })

  it('forwards vacation updates for authoritative Python scope checks', async () => {
    const req = new NextRequest('http://localhost/api/vacations/vacation-1', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ employeeId: 'employee-1', startDate: '2026-11-01', endDate: '2026-11-10' }),
    })
    await PUT(req, { params: Promise.resolve({ id: 'vacation-1' }) })
    expect(mocks.proxy).toHaveBeenCalledWith(req, '/api/vacations/vacation-1', {
      id: 'hr-1', sessionVersion: 1,
    }, 'req-1')
  })

  it('forwards vacation deletes for authoritative Python scope checks', async () => {
    const req = new NextRequest('http://localhost/api/vacations/vacation-1', { method: 'DELETE' })
    await DELETE(req, { params: Promise.resolve({ id: 'vacation-1' }) })
    expect(mocks.authorize).toHaveBeenCalledWith(req, 'vacations.delete')
    expect(mocks.proxy).toHaveBeenCalledWith(req, '/api/vacations/vacation-1', {
      id: 'hr-1', sessionVersion: 1,
    }, 'req-1')
  })
})
