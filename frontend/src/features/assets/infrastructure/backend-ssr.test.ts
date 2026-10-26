import { beforeEach, describe, expect, it, vi } from 'vitest'

const { backendUserFetch } = vi.hoisted(() => ({ backendUserFetch: vi.fn() }))

vi.mock('@/lib/backend/transport', () => ({ backendUserFetch }))

import { readAssetById } from './backend-ssr'

describe('asset SSR backend reads', () => {
  beforeEach(() => backendUserFetch.mockReset())

  it('maps scoped FORBIDDEN detail reads to not-found while the page permission guard remains authoritative', async () => {
    backendUserFetch.mockResolvedValue(Response.json(
      { error: { code: 'FORBIDDEN', message: 'Forbidden' } },
      { status: 403 },
    ))

    await expect(readAssetById({ id: 'user-1', sessionVersion: 0 }, 'asset-1')).resolves.toBeNull()
  })

  it('does not turn other 403 errors such as forced-password-change into not-found', async () => {
    backendUserFetch.mockResolvedValue(Response.json(
      { error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Password change required' } },
      { status: 403 },
    ))

    await expect(readAssetById({ id: 'user-1', sessionVersion: 0 }, 'asset-1'))
      .rejects.toMatchObject({ name: 'BackendRequestError', status: 403 })
  })
})
