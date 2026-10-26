import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), allows: vi.fn(), proxy: vi.fn() }))
vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/finance', () => ({ proxyFinanceRequest: mocks.proxy }))

import { DELETE, GET, PUT } from './route'

const user = { id: 'accountant-1', sessionVersion: 3 }
const access = { allows: mocks.allows }
const params = { params: Promise.resolve({ id: 'project-1' }) }

describe('project payroll Payroll BFF routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({ user, access, requestId: 'request-project-payroll' })
    mocks.allows.mockReturnValue(true)
    mocks.proxy.mockResolvedValue(new Response('{"data":{}}', { status: 200 }))
  })

  it('keeps query validation and project-scoped read authorization', async () => {
    const invalid = new NextRequest('http://localhost/api/projects/project-1/payroll?year=1900')
    expect((await GET(invalid, params)).status).toBe(400)
    expect(mocks.proxy).not.toHaveBeenCalled()

    mocks.allows.mockReturnValue(false)
    const forbidden = new NextRequest('http://localhost/api/projects/project-1/payroll?year=2026')
    expect((await GET(forbidden, params)).status).toBe(403)
    expect(mocks.proxy).not.toHaveBeenCalled()

    mocks.allows.mockReturnValue(true)
    expect((await GET(forbidden, params)).status).toBe(200)
    expect(mocks.authorize).toHaveBeenCalledWith(forbidden, 'projectPayroll.read')
    expect(mocks.allows).toHaveBeenCalledWith('projectPayroll.read', { projectId: 'project-1' })
    expect(mocks.proxy).toHaveBeenCalledWith(
      forbidden, '/api/projects/project-1/payroll?year=2026', user, 'request-project-payroll',
    )
  })

  it('validates save and clear bodies before forwarding', async () => {
    const invalid = new Request('http://localhost/api/projects/project-1/payroll', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}',
    })
    expect((await PUT(invalid as never, params)).status).toBe(400)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const save = new Request('http://localhost/api/projects/project-1/payroll', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ year: 2026, month: 3, employeeId: 'employee-1', okladEnabled: true }),
    })
    expect((await PUT(save as never, params)).status).toBe(200)
    expect(mocks.authorize).toHaveBeenCalledWith(save, {
      anyOf: ['projectPayroll.create', 'projectPayroll.update'],
    })
    expect(mocks.proxy).toHaveBeenCalledWith(save, '/api/projects/project-1/payroll', user, 'request-project-payroll')

    const clear = new Request('http://localhost/api/projects/project-1/payroll', {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ year: 2026, month: 3, employeeId: 'employee-1' }),
    })
    expect((await DELETE(clear as never, params)).status).toBe(200)
    expect(mocks.authorize).toHaveBeenCalledWith(clear, 'projectPayroll.delete')
    expect(mocks.proxy).toHaveBeenCalledWith(clear, '/api/projects/project-1/payroll', user, 'request-project-payroll')
  })
})
