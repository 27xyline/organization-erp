import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/features/assets/application/inventory.service', () => ({
  getAssetInventoryService: () => ({ list: mocks.list, create: mocks.create }),
}))

import { GET, POST } from './route'

describe('assets/inventories route', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.authorize.mockResolvedValue({
      user: { id: 'user-1' },
      access: { allows: vi.fn(() => true) },
      response: null,
    })
  })

  it('lists inventory sessions in the requested page after checking permission', async () => {
    mocks.list.mockResolvedValue({ inventories: [{ id: 'inventory-1' }], total: 31 })
    const request = new NextRequest('http://localhost/api/assets/inventories?page=2&pageSize=10')

    const response = await GET(request)

    expect(mocks.authorize).toHaveBeenCalledWith(request, 'assets.inventory.manage')
    expect(mocks.list).toHaveBeenCalledWith({ page: 2, pageSize: 10 }, expect.anything())
    expect(await response.json()).toEqual({
      data: [{ id: 'inventory-1' }],
      pagination: { page: 2, pageSize: 10, total: 31, totalPages: 4 },
    })
  })

  it('rejects malformed create input before creating a session', async () => {
    const response = await POST(new NextRequest('http://localhost/api/assets/inventories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x', molId: '' }),
    }))

    expect(response.status).toBe(422)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('creates a scoped inventory from validated input', async () => {
    mocks.create.mockResolvedValue({ id: 'inventory-2', status: 'IN_PROGRESS' })
    const request = new NextRequest('http://localhost/api/assets/inventories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Проверка кабинета', molId: 'mol-7' }),
    })

    const response = await POST(request)

    expect(mocks.create).toHaveBeenCalledWith(
      { name: 'Проверка кабинета', molId: 'mol-7' }, 'user-1', expect.anything(), undefined,
    )
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: { id: 'inventory-2', status: 'IN_PROGRESS' } })
  })
})
