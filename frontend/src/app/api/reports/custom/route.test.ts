import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { AccessContext } from '@/lib/auth/access-context'

const mocks = vi.hoisted(() => ({
  authorizeApiRequest: vi.fn(),
  getCustomReport: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({
  authorizeApiRequest: mocks.authorizeApiRequest,
}))

vi.mock('@/features/reporting/application/report.service', () => ({
  ReportService: { getCustomReport: mocks.getCustomReport },
}))

import { POST } from './route'

describe('reports/custom route access', () => {
  const hrAccess = new AccessContext(
    {
      userId: 'hr-1',
      employeeId: 'employee-1',
      employeeDepartmentId: 'department-1',
      memberProjectIds: [],
    },
    [{
      assignmentId: 'hr-assignment',
      role: 'HR',
      departmentScopeMode: 'ASSIGNED',
      projectScopeMode: 'NONE',
      departmentIds: ['department-1'],
      projectIds: [],
    }],
  )

  beforeEach(() => {
    vi.resetAllMocks()
    mocks.authorizeApiRequest.mockResolvedValue({
      user: { id: 'hr-1' },
      access: hrAccess,
      requestId: 'request-1',
    })
  })

  it('rejects metrics outside the caller permissions before querying data', async () => {
    const response = await POST(new NextRequest('http://localhost/api/reports/custom', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        preset: { name: 'Assets', groupBy: 'department', metrics: ['assetValue'] },
        query: { dateFrom: '2026-01-01', dateTo: '2026-01-31' },
      }),
    }))

    expect(response.status).toBe(403)
    expect(mocks.getCustomReport).not.toHaveBeenCalled()
  })

  it('rejects metrics that do not belong to the selected grouping', async () => {
    const response = await POST(new NextRequest('http://localhost/api/reports/custom', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        preset: { name: 'Department report', groupBy: 'department', metrics: ['projectBudget'] },
        query: { dateFrom: '2026-01-01', dateTo: '2026-01-31' },
      }),
    }))

    expect(response.status).toBe(400)
    expect(mocks.getCustomReport).not.toHaveBeenCalled()
  })
})
