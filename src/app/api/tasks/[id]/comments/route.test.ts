import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  allows: vi.fn(() => true),
  taskTarget: vi.fn(async () => ({ projectId: 'project-1' })),
  proxy: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({
  authorizeApiRequest: vi.fn(async () => ({
    user: { id: 'admin-1', sessionVersion: 1 },
    access: { allows: mocks.allows },
    requestId: 'request-1',
  })),
}))
vi.mock('@/lib/auth/resource-scopes', () => ({ taskTarget: mocks.taskTarget }))
vi.mock('@/lib/backend/bridge', () => ({ proxyBackendRequest: mocks.proxy }))
vi.mock('@/lib/backend/client', () => ({
  backendUnavailableResponse: vi.fn(() => Response.json({ error: 'backend unavailable' }, { status: 503 })),
}))

describe('tasks/[id]/comments BFF route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.allows.mockReturnValue(true)
    mocks.taskTarget.mockResolvedValue({ projectId: 'project-1' })
    mocks.proxy.mockImplementation(async () => Response.json({ data: { id: 'comment-1', body: 'Проверка' } }, { status: 201 }))
  })

  it('validates the comment and forwards the original request body', async () => {
    const { POST } = await import('@/app/api/tasks/[id]/comments/route')
    const request = new Request('http://localhost/api/tasks/task-1/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: '  Проверка  ' }),
    })
    const response = await POST(request as never, { params: Promise.resolve({ id: 'task-1' }) })

    expect(response.status).toBe(201)
    expect(mocks.proxy).toHaveBeenCalledWith(request, '/api/tasks/task-1/comments', expect.anything(), 'request-1')
    expect(request.bodyUsed).toBe(false)
    expect(await request.json()).toEqual({ body: '  Проверка  ' })
  })
})
