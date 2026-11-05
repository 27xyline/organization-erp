import { describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ proxy: vi.fn(async () => Response.json({ data: [] })) }))
vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: vi.fn(async () => ({ user: { id: 'user' }, requestId: 'r' })) }))
vi.mock('@/lib/backend/transport', () => ({ proxyBackendRequest: mocks.proxy }))
vi.mock('@/lib/backend/client', () => ({ backendUnavailableResponse: vi.fn() }))
describe('shared tasks BFF', () => {
  it('proxies the authenticated inbox', async () => {
    const { GET } = await import('./route')
    const request = new Request('http://localhost/api/tasks')
    expect((await GET(request as never)).status).toBe(200)
    expect(mocks.proxy).toHaveBeenCalledWith(request, '/api/tasks', expect.anything(), 'r')
  })
})
