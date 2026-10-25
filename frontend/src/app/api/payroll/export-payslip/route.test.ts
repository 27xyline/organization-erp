import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), proxy: vi.fn() }))
vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/finance', () => ({ proxyFinanceRequest: mocks.proxy }))

import { GET } from './route'

describe('payroll payslip Payroll BFF route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({ user: { id: 'payroll-admin', sessionVersion: 1 }, requestId: 'request-payslip' })
    mocks.proxy.mockResolvedValue(new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': 'attachment; filename="payslip-EMP-7-2026-10.xlsx"',
        'cache-control': 'no-store',
      },
    }))
  })

  it('keeps scoped export authorization, forwards the query, and preserves bytes and headers', async () => {
    const request = new NextRequest('http://localhost/api/payroll/export-payslip?year=2026&month=10&employeeId=c123')
    const response = await GET(request)

    expect(mocks.authorize).toHaveBeenCalledWith(request, 'payroll.export')
    expect(mocks.proxy).toHaveBeenCalledWith(request, '/api/payroll/export-payslip?year=2026&month=10&employeeId=c123', { id: 'payroll-admin', sessionVersion: 1 }, 'request-payslip')
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="payslip-EMP-7-2026-10.xlsx"')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('rejects a missing employee id before proxying', async () => {
    const request = new NextRequest('http://localhost/api/payroll/export-payslip?year=2026&month=10')
    expect((await GET(request)).status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()
  })

  it('applies the shared payroll year range before proxying', async () => {
    const request = new NextRequest('http://localhost/api/payroll/export-payslip?year=2101&month=10&employeeId=c123')
    expect((await GET(request)).status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()
  })
})
