import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorizeApiRequest: vi.fn(),
  search: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorizeApiRequest }))
vi.mock('@/features/search/application/global-search.service', () => ({
  GlobalSearchService: { search: mocks.search },
}))

import { GET } from './route'

describe('/api/search', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.authorizeApiRequest.mockResolvedValue({
      user: { id: 'user-1' },
      access: { marker: 'scoped-access' },
      requestId: 'request-1',
      response: null,
    })
    mocks.search.mockResolvedValue([{ id: 'asset-1', type: 'asset', title: 'Ноутбук', subtitle: 'INV-1', href: '/assets/asset-1' }])
  })

  it('authorizes users with any searchable read permission and returns scoped results', async () => {
    const request = new NextRequest('http://localhost/api/search?q=INV-1')

    const response = await GET(request)

    expect(mocks.authorizeApiRequest).toHaveBeenCalledWith(request, {
      anyOf: ['employees.read', 'assets.read', 'projects.read', 'tasks.read', 'documents.read'],
    })
    expect(mocks.search).toHaveBeenCalledWith('INV-1', { marker: 'scoped-access' })
    expect(await response.json()).toEqual({ data: [
      { id: 'asset-1', type: 'asset', title: 'Ноутбук', subtitle: 'INV-1', href: '/assets/asset-1' },
    ] })
  })

  it('rejects queries shorter than two characters before searching', async () => {
    const response = await GET(new NextRequest('http://localhost/api/search?q=a'))

    expect(response.status).toBe(422)
    expect(mocks.search).not.toHaveBeenCalled()
  })
})
