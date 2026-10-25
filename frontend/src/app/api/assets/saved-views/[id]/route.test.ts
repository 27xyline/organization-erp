import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), proxy: vi.fn() }))
vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/assets', () => ({ proxyAssetRequest: mocks.proxy }))

import { DELETE } from './route'

describe('assets/saved-views/[id] BFF', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.authorize.mockResolvedValue({ user: { id: 'user-21', sessionVersion: 2 }, response: null })
    mocks.proxy.mockResolvedValue(new Response(null, { status: 204 }))
  })

  it('forwards the delete to Python after the authenticated read permission check', async () => {
    const request = new NextRequest('http://localhost/api/assets/saved-views/view-4', { method: 'DELETE' })

    const response = await DELETE(request, { params: Promise.resolve({ id: 'view-4' }) })

    expect(mocks.authorize).toHaveBeenCalledWith(request, 'assets.read')
    expect(mocks.proxy).toHaveBeenCalledWith(request, '/api/assets/saved-views/view-4', expect.objectContaining({ id: 'user-21' }), undefined)
    expect(response.status).toBe(204)
  })

  it('stops before Python when read permission is denied', async () => {
    mocks.authorize.mockResolvedValue({ response: Response.json({ error: { code: 'FORBIDDEN' } }, { status: 403 }) })
    const request = new NextRequest('http://localhost/api/assets/saved-views/view-4', { method: 'DELETE' })

    const response = await DELETE(request, { params: Promise.resolve({ id: 'view-4' }) })

    expect(response.status).toBe(403)
    expect(mocks.proxy).not.toHaveBeenCalled()
  })
})
