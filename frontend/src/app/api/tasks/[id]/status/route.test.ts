import { describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ proxy: vi.fn(async () => Response.json({ data: { status: 'COMPLETED' } })) }))
vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: vi.fn(async () => ({ user: { id: 'user' }, requestId: 'r' })) }))
vi.mock('@/lib/backend/transport', () => ({ proxyBackendRequest: mocks.proxy }))
vi.mock('@/lib/backend/client', () => ({ backendUnavailableResponse: vi.fn() }))
describe('assigned status BFF', () => {
  it('rejects extra fields', async () => {
    const { PATCH } = await import('./route')
    const request = new Request('http://localhost/api/tasks/t1/status', { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED', name: 'Forbidden' }) })
    expect((await PATCH(request as never, { params: Promise.resolve({ id: 't1' }) })).status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()
  })
})
it('returns a client error for malformed JSON', async () => {
  const { PATCH } = await import('./route')
  const request = new Request('http://localhost/api/tasks/t/status', { method: 'PATCH', body: '{' })
  expect((await PATCH(request as never, { params: Promise.resolve({ id: 't' }) })).status).toBe(400)
})
