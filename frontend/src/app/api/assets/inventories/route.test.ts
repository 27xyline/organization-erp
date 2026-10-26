import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), proxy: vi.fn() }))
vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/assets', () => ({ proxyAssetRequest: mocks.proxy }))

import { GET, POST } from './route'

describe('assets/inventories BFF', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.authorize.mockResolvedValue({
      user: { id: 'user-1', sessionVersion: 5 }, requestId: 'request-1', response: null,
    })
    mocks.proxy.mockResolvedValue(Response.json({ data: [] }))
  })

  it('validates and forwards inventory list filters', async () => {
    const request = new NextRequest('http://localhost/api/assets/inventories?page=2&pageSize=10')

    await GET(request)

    expect(mocks.authorize).toHaveBeenCalledWith(request, 'assets.inventory.manage')
    expect(mocks.proxy).toHaveBeenCalledWith(request, '/api/assets/inventories?page=2&pageSize=10', expect.anything(), 'request-1')
  })

  it('rejects malformed create input before proxying', async () => {
    const response = await POST(new NextRequest('http://localhost/api/assets/inventories', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x', molId: '' }),
    }))

    expect(response.status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()
  })

  it('keeps the original validated JSON body readable for the bridge', async () => {
    const request = new NextRequest('http://localhost/api/assets/inventories', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Проверка кабинета', molId: 'mol-7' }),
    })

    await POST(request)

    expect(mocks.proxy).toHaveBeenCalledWith(request, '/api/assets/inventories', expect.anything(), 'request-1')
    expect(await request.json()).toEqual({ name: 'Проверка кабинета', molId: 'mol-7' })
  })
})
