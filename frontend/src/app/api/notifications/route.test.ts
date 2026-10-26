import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ authorizeApiRequest: vi.fn(), proxy: vi.fn() }))

vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorizeApiRequest }))
vi.mock('@/lib/backend/notifications', () => ({ proxyNotificationRequest: mocks.proxy }))

describe('notifications route', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.authorizeApiRequest.mockResolvedValue({
      user: { id: 'current-user', sessionVersion: 9 },
      requestId: 'request-1',
      response: null,
    })
    mocks.proxy.mockResolvedValue(Response.json({ data: [], pagination: { page: 2 } }))
  })

  it('validates the query then proxies the caller path without changing its query string', async () => {
    const request = new NextRequest(
      'http://localhost/api/notifications?page=2&pageSize=10&unreadOnly=true&userId=other',
    )
    const { GET } = await import('./route')
    const response = await GET(request)
    expect(response.status).toBe(200)
    expect(mocks.proxy).toHaveBeenCalledWith(
      request,
      '/api/notifications?page=2&pageSize=10&unreadOnly=true&userId=other',
      expect.objectContaining({ id: 'current-user', sessionVersion: 9 }),
      'request-1',
    )
  })

  it('rejects invalid query values before forwarding', async () => {
    const request = new NextRequest('http://localhost/api/notifications?unreadOnly=no')
    const { GET } = await import('./route')
    const response = await GET(request)
    expect(response.status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()
  })
})
