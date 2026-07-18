import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/authorization', () => ({
  authorizeApiRequest: vi.fn(async () => ({
    user: { id: 'admin-1', username: 'admin', name: 'Admin', role: 'ADMIN' },
    requestId: 'request-1',
  })),
}))

vi.mock('@/features/departments/application/department.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/departments/application/department.service')
  >('@/features/departments/application/department.service')
  return {
    ...actual,
    DepartmentService: {
      update: vi.fn(),
      delete: vi.fn(),
    },
  }
})
describe('departments/[id] route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns HTTP 409 when deleting a used department', async () => {
    const {
      DepartmentService,
      DepartmentServiceError,
    } = await import('@/features/departments/application/department.service')
    const { DELETE } = await import('./route')
    vi.mocked(DepartmentService.delete).mockRejectedValueOnce(
      new DepartmentServiceError('IN_USE'),
    )

    const response = await DELETE(
      new Request('http://localhost/api/departments/department-1', {
        method: 'DELETE',
      }) as never,
      { params: Promise.resolve({ id: 'department-1' }) },
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: {
        code: 'IN_USE',
        message: 'Подразделение используется и не может быть удалено',
      },
    })
  })

  it('rejects an empty patch payload', async () => {
    const { PATCH } = await import('./route')

    const response = await PATCH(
      new Request('http://localhost/api/departments/department-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }) as never,
      { params: Promise.resolve({ id: 'department-1' }) },
    )

    expect(response.status).toBe(422)
    expect((await response.json()).error.code).toBe('VALIDATION_ERROR')
  })
})
