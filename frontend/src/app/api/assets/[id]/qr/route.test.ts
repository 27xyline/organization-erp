import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), proxy: vi.fn() }))
vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/stage07', () => ({ proxyStage07Request: mocks.proxy }))

import { GET } from './route'

describe('assets/[id]/qr BFF', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://erp.example.com')
    mocks.authorize.mockResolvedValue({
      user: { id: 'user-4', sessionVersion: 2 }, requestId: 'request-4', response: null,
    })
    mocks.proxy.mockResolvedValue(new Response('<svg/>', {
      headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'private, no-store' },
    }))
  })
  afterEach(() => vi.unstubAllEnvs())

  it('forwards the browser origin to Python and preserves the private SVG response', async () => {
    const request = new NextRequest('http://localhost:3001/api/assets/asset-4/qr')

    const response = await GET(request, { params: Promise.resolve({ id: 'asset-4' }) })

    expect(mocks.authorize).toHaveBeenCalledWith(request, 'assets.read')
    expect(mocks.proxy).toHaveBeenCalledWith(
      request,
      '/api/assets/asset-4/qr?origin=https%3A%2F%2Ferp.example.com',
      expect.objectContaining({ id: 'user-4' }),
      'request-4',
    )
    expect(response.headers.get('content-type')).toContain('image/svg+xml')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.text()).toBe('<svg/>')
  })

  it('uses the request origin when no public app URL is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    const request = new NextRequest('https://tenant.example.org/api/assets/asset-4/qr')

    await GET(request, { params: Promise.resolve({ id: 'asset-4' }) })

    expect(mocks.proxy).toHaveBeenCalledWith(
      request,
      '/api/assets/asset-4/qr?origin=https%3A%2F%2Ftenant.example.org',
      expect.objectContaining({ id: 'user-4' }),
      'request-4',
    )
  })
})
