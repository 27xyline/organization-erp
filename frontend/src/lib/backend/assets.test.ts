import { beforeEach, describe, expect, it, vi } from 'vitest'

const { proxyBackendRequest } = vi.hoisted(() => ({ proxyBackendRequest: vi.fn() }))
vi.mock('./transport', () => ({ proxyBackendRequest }))

import { proxyAssetJsonRequest } from './assets'

describe('Assets JSON request bridge', () => {
  beforeEach(() => {
    proxyBackendRequest.mockReset().mockResolvedValue(new Response(null, { status: 204 }))
  })

  it('re-serializes validated JSON, removes stale content length, and preserves caller identity', async () => {
    const request = new Request('https://erp.example/api/assets', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '12', origin: 'https://erp.example' },
      body: '{"unused":true}',
    })
    const user = { id: 'user-1', sessionVersion: 3 }

    await proxyAssetJsonRequest(request, '/api/assets', user, 'request-1', { recordingDate: '2026-07-16T00:00:00.000Z' })

    const [forwarded, path, forwardedUser, requestId] = proxyBackendRequest.mock.calls[0]
    expect(path).toBe('/api/assets')
    expect(forwardedUser).toBe(user)
    expect(requestId).toBe('request-1')
    expect(forwarded.headers.get('content-type')).toBe('application/json')
    expect(forwarded.headers.get('content-length')).toBeNull()
    expect(forwarded.headers.get('origin')).toBe('https://erp.example')
    await expect(forwarded.json()).resolves.toEqual({ recordingDate: '2026-07-16T00:00:00.000Z' })
  })
})
