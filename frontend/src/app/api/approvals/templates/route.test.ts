import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorizeApiRequest: vi.fn(),
  proxy: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({
  authorizeApiRequest: mocks.authorizeApiRequest,
}))

vi.mock('@/lib/backend/stage09', () => ({ proxyStage09: mocks.proxy }))

import { GET, POST } from './route'

describe('approvals/templates route', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.authorizeApiRequest.mockResolvedValue({
      user: { id: 'admin-1', sessionVersion: 4, permissions: ['approvals.create'] },
      requestId: 'request-1',
      response: null,
    })
    mocks.proxy.mockResolvedValue(Response.json({ data: [{ id: 'active' }] }))
  })

  it('proxies template list after the existing any-of authorization check', async () => {
    const request = new NextRequest('http://localhost/api/approvals/templates')
    const response = await GET(request)
    expect(mocks.authorizeApiRequest).toHaveBeenCalledWith(
      request,
      { anyOf: ['approvals.create', 'approvals.templates.manage'] },
    )
    expect(mocks.proxy).toHaveBeenCalledWith(request, '/api/approvals/templates', expect.objectContaining({
      id: 'admin-1', sessionVersion: 4,
    }), 'request-1')
    expect(await response.json()).toEqual({ data: [{ id: 'active' }] })
  })

  it('validates duplicate approvers before forwarding template creation', async () => {
    const request = new NextRequest('http://localhost/api/approvals/templates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Закупка',
        steps: [
          { name: 'Руководитель', approverId: 'user-1' },
          { name: 'Финансы', approverId: 'user-1' },
        ],
      }),
    })
    const response = await POST(request)
    expect(response.status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()
  })
})
