import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorizeApiRequest: vi.fn(),
  proxy: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorizeApiRequest }))
vi.mock('@/lib/backend/reporting', () => ({
  proxyReportingRequest: mocks.proxy,
}))

import { GET } from './route'

describe('/api/search', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.authorizeApiRequest.mockResolvedValue({
      user: { id: 'user-1', sessionVersion: 2 },
      access: { marker: 'scoped-access' },
      requestId: 'request-1',
      response: null,
    })
    mocks.proxy.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }))
  })

  it('authorizes users with any searchable read permission and returns scoped results', async () => {
    const request = new NextRequest('http://localhost/api/search?q=INV-1')

    const response = await GET(request)

    expect(mocks.authorizeApiRequest).toHaveBeenCalledWith(request, {
      anyOf: ['employees.read', 'assets.read', 'projects.read', 'tasks.read', 'documents.read'],
    })
    expect(mocks.proxy).toHaveBeenCalledWith(
      request,
      '/api/search?q=INV-1',
      { id: 'user-1', sessionVersion: 2 },
      'request-1',
    )
    expect(await response.json()).toEqual({ data: [] })
  })

  it('rejects queries shorter than two characters before searching', async () => {
    const response = await GET(new NextRequest('http://localhost/api/search?q=a'))

    expect(response.status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()
  })
})
