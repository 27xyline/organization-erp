import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  allows: vi.fn(() => true),
  proxy: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({
  authorizeApiRequest: vi.fn(async () => ({
    user: { id: 'admin-1', sessionVersion: 1 },
    access: { allows: mocks.allows },
    requestId: 'request-1',
  })),
}))

vi.mock('@/lib/backend/transport', () => ({ proxyBackendRequest: mocks.proxy }))
vi.mock('@/lib/backend/client', () => ({
  backendUnavailableResponse: vi.fn(() => Response.json({ error: 'backend unavailable' }, { status: 503 })),
}))

describe('projects/[id]/members BFF route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.allows.mockReturnValue(true)
    mocks.proxy.mockImplementation(async () => Response.json({ members: [], availableEmployees: [] }))
  })

  it('keeps the legacy raw members envelope and forwards the project path', async () => {
    const { GET } = await import('@/app/api/projects/[id]/members/route')
    const request = new NextRequest('http://localhost/api/projects/project-1/members')
    const response = await GET(request, { params: Promise.resolve({ id: 'project-1' }) })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ members: [], availableEmployees: [] })
    expect(mocks.proxy).toHaveBeenCalledWith(
      request,
      '/api/projects/project-1/members',
      expect.objectContaining({ id: 'admin-1' }),
      'request-1',
    )
  })

  it('preserves member create request and the public 201 response', async () => {
    mocks.proxy.mockImplementationOnce(async () => Response.json(
      { success: true, member: { id: 'member-1', employeeId: 'emp-1' } },
      { status: 201 },
    ))
    const { POST } = await import('@/app/api/projects/[id]/members/route')
    const request = new Request('http://localhost/api/projects/project-1/members', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: 'emp-1' }),
    })
    const response = await POST(request as never, { params: Promise.resolve({ id: 'project-1' }) })

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ success: true, member: { employeeId: 'emp-1' } })
    expect(mocks.proxy).toHaveBeenCalledWith(
      request,
      '/api/projects/project-1/members',
      expect.anything(),
      'request-1',
    )
  })

  it('rejects a missing employeeId before calling Python', async () => {
    const { POST } = await import('@/app/api/projects/[id]/members/route')
    const response = await POST(
      new Request('http://localhost/api/projects/project-1/members', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      }) as never,
      { params: Promise.resolve({ id: 'project-1' }) },
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Сотрудник обязателен' })
    expect(mocks.proxy).not.toHaveBeenCalled()
  })

  it('keeps the project scope precheck ahead of backend forwarding', async () => {
    mocks.allows.mockReturnValue(false)
    const { GET } = await import('@/app/api/projects/[id]/members/route')
    const response = await GET(
      new NextRequest('http://localhost/api/projects/project-1/members'),
      { params: Promise.resolve({ id: 'project-1' }) },
    )

    expect(response.status).toBe(403)
    expect(mocks.proxy).not.toHaveBeenCalled()
  })
})
