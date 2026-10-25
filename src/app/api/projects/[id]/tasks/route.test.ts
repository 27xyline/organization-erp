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

describe('projects/[id]/tasks BFF route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.allows.mockReturnValue(true)
    mocks.proxy.mockImplementation(async () => Response.json({ data: [] }))
  })

  it('forwards the authorized task list and preserves the data envelope', async () => {
    const { GET } = await import('@/app/api/projects/[id]/tasks/route')
    const request = new NextRequest('http://localhost/api/projects/project-1/tasks')
    const response = await GET(request, { params: Promise.resolve({ id: 'project-1' }) })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: [] })
    expect(mocks.proxy).toHaveBeenCalledWith(
      request,
      '/api/projects/project-1/tasks',
      expect.objectContaining({ id: 'admin-1' }),
      'request-1',
    )
  })

  it('keeps the public task payload and 201 status when creating a task', async () => {
    mocks.proxy.mockImplementationOnce(async () => Response.json(
      { data: { id: 'task-1', name: 'Корневая задача', assignees: [] } },
      { status: 201 },
    ))
    const { POST } = await import('@/app/api/projects/[id]/tasks/route')
    const request = new Request('http://localhost/api/projects/project-1/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Корневая задача', employeeIds: [] }),
    })
    const response = await POST(request as never, { params: Promise.resolve({ id: 'project-1' }) })

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ data: { name: 'Корневая задача' } })
    expect(mocks.proxy).toHaveBeenCalledWith(request, '/api/projects/project-1/tasks', expect.anything(), 'request-1')
  })

  it('keeps input validation before forwarding', async () => {
    const { POST } = await import('@/app/api/projects/[id]/tasks/route')
    const response = await POST(
      new Request('http://localhost/api/projects/project-1/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '', level: 4 }),
      }) as never,
      { params: Promise.resolve({ id: 'project-1' }) },
    )

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
    expect(mocks.proxy).not.toHaveBeenCalled()
  })

  it('blocks task list reads when the project scope is denied', async () => {
    mocks.allows.mockReturnValue(false)
    const { GET } = await import('@/app/api/projects/[id]/tasks/route')
    const response = await GET(
      new NextRequest('http://localhost/api/projects/project-1/tasks'),
      { params: Promise.resolve({ id: 'project-1' }) },
    )

    expect(response.status).toBe(403)
    expect(mocks.proxy).not.toHaveBeenCalled()
  })
})
