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

describe('tasks/[id] BFF route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.allows.mockReturnValue(true)
    mocks.taskTarget.mockResolvedValue({ projectId: 'project-1' })
    mocks.proxy.mockImplementation(async () => Response.json({ data: { id: 'task-1', status: 'IN_PROGRESS' } }))
  })

  it('preserves the Kanban status-only PUT contract', async () => {
    const { PUT } = await import('@/app/api/tasks/[id]/route')
    const request = new Request('http://localhost/api/tasks/task-1', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'IN_PROGRESS' }),
    })
    const response = await PUT(request as never, { params: Promise.resolve({ id: 'task-1' }) })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ data: { status: 'IN_PROGRESS' } })
    expect(mocks.proxy).toHaveBeenCalledWith(request, '/api/tasks/task-1', expect.anything(), 'request-1')
  })

  it('keeps the task resource scope precheck before forwarding', async () => {
    mocks.allows.mockReturnValue(false)
    const { PUT } = await import('@/app/api/tasks/[id]/route')
    const response = await PUT(
      new Request('http://localhost/api/tasks/task-1', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'COMPLETED' }),
      }) as never,
      { params: Promise.resolve({ id: 'task-1' }) },
    )

    expect(response.status).toBe(403)
    expect(mocks.proxy).not.toHaveBeenCalled()
  })

  it('keeps Zod validation on the Next.js boundary', async () => {
    const { PUT } = await import('@/app/api/tasks/[id]/route')
    const response = await PUT(
      new Request('http://localhost/api/tasks/task-1', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'UNKNOWN' }),
      }) as never,
      { params: Promise.resolve({ id: 'task-1' }) },
    )

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
    expect(mocks.proxy).not.toHaveBeenCalled()
  })
})
