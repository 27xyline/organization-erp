import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/backend/bridge', () => ({
  authenticateBackendCredentials: vi.fn(),
}))

import { authOptions } from './auth'
import { authenticateBackendCredentials } from './backend/bridge'

const provider = authOptions.providers[0] as unknown as {
  options: { authorize(credentials: Record<string, unknown>): Promise<unknown> }
}

describe('NextAuth credentials provider delegates to Python', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the authenticated DTO from the internal endpoint', async () => {
    vi.mocked(authenticateBackendCredentials).mockResolvedValue(Response.json({
      data: {
        id: 'user-1',
        name: 'User One',
        username: 'user.one',
        role: 'VIEWER',
        roles: ['AUDITOR'],
        sessionVersion: 3,
        mustChangePassword: false,
      },
    }))
    const user = await provider.options.authorize({ username: '  User.One ', password: 'password' })
    expect(authenticateBackendCredentials).toHaveBeenCalledWith('user.one', 'password')
    expect(user).toMatchObject({ id: 'user-1', username: 'user.one', sessionVersion: 3 })
  })

  it('normalizes credential rejection and never falls back when the backend is unavailable', async () => {
    vi.mocked(authenticateBackendCredentials).mockResolvedValue(Response.json({ data: null }))
    await expect(provider.options.authorize({ username: 'missing', password: 'wrong' })).resolves.toBeNull()

    vi.mocked(authenticateBackendCredentials).mockResolvedValue(new Response(null, { status: 503 }))
    await expect(provider.options.authorize({ username: 'user', password: 'password' })).rejects.toThrow(
      'Authentication service is unavailable',
    )
    expect(authenticateBackendCredentials).toHaveBeenCalledTimes(2)
  })
})
