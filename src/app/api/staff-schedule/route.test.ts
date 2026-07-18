import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/authorization', () => ({
  authorizeApiRequest: vi.fn(async () => ({
    user: { id: 'admin-1', username: 'admin', name: 'Admin', role: 'ADMIN' },
    access: { allows: vi.fn(() => true) },
    requestId: 'request-1',
  })),
}))

vi.mock('@/features/employees/application/workforce.service', () => ({
  WorkforceService: {
    listPositions: vi.fn(),
    createPosition: vi.fn(),
  },
}))

describe('staff-schedule route department errors', () => {
  beforeEach(() => vi.clearAllMocks())

  it('maps an inactive department to HTTP 409', async () => {
    const { WorkforceService } = await import('@/features/employees/application/workforce.service')
    const { DepartmentReferenceError } = await import('@/lib/organization/department-reference')
    const { POST } = await import('./route')
    vi.mocked(WorkforceService.createPosition).mockRejectedValueOnce(
      new DepartmentReferenceError('INACTIVE_DEPARTMENT'),
    )

    const response = await POST(new Request('http://localhost/api/staff-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position: 'Инженер',
        departmentId: 'department-inactive',
        rate: 1,
        salary: 100000,
      }),
    }) as never)

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: {
        code: 'INACTIVE_DEPARTMENT',
        message: 'Нельзя назначить неактивное подразделение',
      },
    })
  })

  it('returns HTTP 422 when neither department ID nor legacy name is provided', async () => {
    const { POST } = await import('./route')
    const response = await POST(new Request('http://localhost/api/staff-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position: 'Инженер',
        rate: 1,
        salary: 100000,
      }),
    }) as never)

    expect(response.status).toBe(422)
    expect((await response.json()).error.code).toBe('VALIDATION_ERROR')
  })
})
