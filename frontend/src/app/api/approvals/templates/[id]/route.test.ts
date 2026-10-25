import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorizeApiRequest: vi.fn(),
  proxy: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({
  authorizeApiRequest: mocks.authorizeApiRequest,
}))

vi.mock('@/lib/backend/notifications', () => ({ proxyNotificationRequest: mocks.proxy }))

import { PATCH } from './route'

describe('approvals/templates/[id] route', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.authorizeApiRequest.mockResolvedValue({
      user: { id: 'admin-1', sessionVersion: 4 },
      requestId: 'request-1',
      response: null,
    })
    mocks.proxy.mockResolvedValue(Response.json({ data: { id: 'template-1', isActive: false } }))
  })

  it('forwards a validated template patch to Python', async () => {
    const request = new NextRequest('http://localhost/api/approvals/templates/template-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    })
    const response = await PATCH(request, { params: Promise.resolve({ id: 'template-1' }) })
    expect(mocks.authorizeApiRequest).toHaveBeenCalledWith(request, 'approvals.templates.manage')
    expect(mocks.proxy).toHaveBeenCalledWith(
      request,
      '/api/approvals/templates/template-1',
      expect.objectContaining({ id: 'admin-1', sessionVersion: 4 }),
      'request-1',
    )
    expect(await response.json()).toEqual({ data: { id: 'template-1', isActive: false } })
  })

  it('rejects an empty patch without forwarding it', async () => {
    const request = new NextRequest('http://localhost/api/approvals/templates/template-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const response = await PATCH(request, { params: Promise.resolve({ id: 'template-1' }) })
    expect(response.status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()
  })
})
