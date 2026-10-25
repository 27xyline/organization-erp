import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), proxy: vi.fn() }))
vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/stage10', () => ({ proxyStage10Request: mocks.proxy }))

import { GET } from './route'

describe('payroll export Stage10 BFF route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({ user: { id: 'payroll-admin', sessionVersion: 1 }, requestId: 'request-export' })
    mocks.proxy.mockResolvedValue(new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': 'attachment; filename="payroll-2026-10.xlsx"',
        'cache-control': 'no-store',
      },
    }))
  })

  it('authorizes and forwards the exact query while preserving the binary response', async () => {
    const request = new NextRequest('http://localhost/api/payroll/export?year=2026&month=10')
    const response = await GET(request)

    expect(mocks.authorize).toHaveBeenCalledWith(request, 'payroll.export')
    expect(mocks.proxy).toHaveBeenCalledWith(request, '/api/payroll/export?year=2026&month=10', { id: 'payroll-admin', sessionVersion: 1 }, 'request-export')
    expect(response.status).toBe(200)
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="payroll-2026-10.xlsx"')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('rejects invalid year/month before proxying', async () => {
    const request = new NextRequest('http://localhost/api/payroll/export?year=2026&month=13')
    expect((await GET(request)).status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()
  })
})
