import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ authorizeApiRequest: vi.fn(), proxy: vi.fn() }))

vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorizeApiRequest }))
vi.mock('@/lib/backend/notifications', () => ({ proxyNotificationRequest: mocks.proxy }))
vi.mock('@/features/notifications/application/smtp.service', () => ({
  SmtpService: { processOutbox: vi.fn().mockResolvedValue({ processed: 1 }) },
}))

describe('notification SMTP process route', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.authorizeApiRequest.mockResolvedValue({
      user: { id: 'current-user', sessionVersion: 9 },
      requestId: 'request-1',
      response: null,
    })
    mocks.proxy.mockResolvedValue(Response.json({ data: { processed: 1 } }))
  })

  it('authorizes and proxies the POST request with the caller context', async () => {
    const request = new NextRequest('http://localhost/api/notifications/smtp/process', { method: 'POST' })
    const { POST } = await import('./route')
    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(mocks.authorizeApiRequest).toHaveBeenCalledWith(request, 'access.users.update')
    expect(mocks.proxy).toHaveBeenCalledWith(
      request,
      '/api/notifications/smtp/process',
      { id: 'current-user', sessionVersion: 9 },
      'request-1',
    )
  })

  it('returns permission denial without proxying', async () => {
    const denial = Response.json({ error: 'forbidden' }, { status: 403 })
    mocks.authorizeApiRequest.mockResolvedValue({ response: denial })
    const request = new NextRequest('http://localhost/api/notifications/smtp/process', { method: 'POST' })
    const { POST } = await import('./route')

    expect(await POST(request)).toBe(denial)
    expect(mocks.proxy).not.toHaveBeenCalled()
  })
})
