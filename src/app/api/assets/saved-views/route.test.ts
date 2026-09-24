import { Prisma } from '@prisma/client'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorizeApiRequest: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({
  authorizeApiRequest: mocks.authorizeApiRequest,
}))

vi.mock('@/features/assets/application/saved-view.service', () => ({
  getAssetSavedViewService: () => ({ list: mocks.list, create: mocks.create }),
}))

import { GET, POST } from './route'

describe('assets/saved-views route', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.authorizeApiRequest.mockResolvedValue({
      user: { id: 'user-17' },
      response: null,
    })
  })

  it('lists only the current user views after checking read access', async () => {
    mocks.list.mockResolvedValueOnce([{
      id: 'view-1', name: 'На ремонте', filters: { status: 'UNDER_REPAIR' },
    }])
    const request = new NextRequest('http://localhost/api/assets/saved-views')

    const response = await GET(request)

    expect(mocks.authorizeApiRequest).toHaveBeenCalledWith(request, 'assets.read')
    expect(mocks.list).toHaveBeenCalledWith('user-17')
    expect(await response.json()).toEqual({
      data: [{ id: 'view-1', name: 'На ремонте', filters: { status: 'UNDER_REPAIR' } }],
    })
  })

  it('creates a named view for the authenticated owner', async () => {
    const view = { id: 'view-2', name: 'Ноутбуки', filters: { search: 'Ноутбук' } }
    mocks.create.mockResolvedValueOnce(view)

    const response = await POST(new NextRequest('http://localhost/api/assets/saved-views', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ноутбуки', filters: { search: 'Ноутбук' } }),
    }))

    expect(mocks.authorizeApiRequest.mock.calls[0]?.[1]).toBe('assets.read')
    expect(mocks.create).toHaveBeenCalledWith('user-17', {
      name: 'Ноутбуки', filters: { search: 'Ноутбук' },
    })
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: view })
  })

  it('rejects unknown filter fields', async () => {
    const response = await POST(new NextRequest('http://localhost/api/assets/saved-views', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Все данные', filters: { archived: true } }),
    }))

    expect(response.status).toBe(422)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('returns a conflict when the owner already used that view name', async () => {
    mocks.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '6.19.3' },
    ))

    const response = await POST(new NextRequest('http://localhost/api/assets/saved-views', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Все данные', filters: {} }),
    }))

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: 'SAVED_VIEW_EXISTS' } })
  })
})
