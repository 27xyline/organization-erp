import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/authorization', () => ({
  authorizeApiRequest: vi.fn(async () => ({
    user: { id: 'admin-1', username: 'admin', name: 'Admin', role: 'ADMIN' },
    requestId: 'request-1',
  })),
}))

vi.mock('@/features/employees/application/workforce.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/employees/application/workforce.service')
  >('@/features/employees/application/workforce.service')
  return {
    ...actual,
    WorkforceService: {
      updatePosition: vi.fn(),
      deletePosition: vi.fn(),
    },
  }
})

describe('staff-schedule item route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('maps an occupied position department change to HTTP 409', async () => {
    const {
      WorkforceService,
      WorkforceServiceError,
    } = await import('@/features/employees/application/workforce.service')
    const { PUT } = await import('./route')
    vi.mocked(WorkforceService.updatePosition).mockRejectedValueOnce(
      new WorkforceServiceError('POSITION_DEPARTMENT_CHANGE_IN_USE'),
    )

    const response = await PUT(new Request('http://localhost/api/staff-schedule/staff-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position: 'Инженер',
        departmentId: 'department-new',
        rate: 2,
        salary: 150000,
      }),
    }) as never, {
      params: Promise.resolve({ id: 'staff-1' }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: {
        code: 'POSITION_DEPARTMENT_CHANGE_IN_USE',
        message: 'Нельзя изменить подразделение должности с назначенными сотрудниками',
      },
    })
  })
})
