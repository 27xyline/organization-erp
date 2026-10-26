import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), proxy: vi.fn() }))
vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/assets', () => ({ proxyAssetRequest: mocks.proxy }))

import { GET, POST } from './route'

describe('assets/saved-views BFF', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.authorize.mockResolvedValue({
      user: { id: 'user-17', sessionVersion: 4 }, requestId: 'request-7', response: null,
    })
    mocks.proxy.mockResolvedValue(Response.json({ data: [] }))
  })

  it('proxies reads to FastAPI after checking current-user permission', async () => {
    const request = new NextRequest('http://localhost/api/assets/saved-views')

    await GET(request)

    expect(mocks.authorize).toHaveBeenCalledWith(request, 'assets.read')
    expect(mocks.proxy).toHaveBeenCalledWith(request, '/api/assets/saved-views', expect.objectContaining({ id: 'user-17' }), 'request-7')
  })

  it('validates the public input on a clone and forwards the untouched body', async () => {
    const request = new NextRequest('http://localhost/api/assets/saved-views', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ноутбуки', filters: { search: 'Dell' } }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(mocks.proxy).toHaveBeenCalledWith(request, '/api/assets/saved-views', expect.anything(), 'request-7')
    expect(await request.json()).toEqual({ name: 'Ноутбуки', filters: { search: 'Dell' } })
  })

  it('rejects unknown filter fields before reaching FastAPI', async () => {
    const response = await POST(new NextRequest('http://localhost/api/assets/saved-views', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Все данные', filters: { archived: true } }),
    }))

    expect(response.status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()
  })

  it('does not contact Python when the browser permission check denies access', async () => {
    mocks.authorize.mockResolvedValue({ response: Response.json({ error: { code: 'FORBIDDEN' } }, { status: 403 }) })
    const request = new NextRequest('http://localhost/api/assets/saved-views')

    const response = await GET(request)

    expect(response.status).toBe(403)
    expect(mocks.proxy).not.toHaveBeenCalled()
  })
})
