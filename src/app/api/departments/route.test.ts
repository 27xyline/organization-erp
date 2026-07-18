import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/authorization', () => ({
  authorizeApiRequest: vi.fn(async () => ({
    user: { id: 'admin-1', username: 'admin', name: 'Admin', role: 'ADMIN' },
    access: { allows: vi.fn(() => true) },
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
      list: vi.fn(),
      create: vi.fn(),
    },
  }
})
describe('departments route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a department through an admin-only endpoint', async () => {
    const { authorizeApiRequest } = await import('@/lib/auth/authorization')
    const { DepartmentService } = await import('@/features/departments/application/department.service')
    const { POST } = await import('./route')
    vi.mocked(DepartmentService.create).mockResolvedValue({ id: 'department-1' } as never)

    const response = await POST(new Request('http://localhost/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'DEP-1',
        name: 'Исследовательский отдел',
        parentId: null,
        headEmployeeId: null,
        isActive: true,
      }),
    }) as never)

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: { id: 'department-1' } })
    expect(authorizeApiRequest).toHaveBeenCalledWith(expect.anything(), 'departments.create')
  })

  it('maps a case-insensitive duplicate to HTTP 409', async () => {
    const {
      DepartmentService,
      DepartmentServiceError,
    } = await import('@/features/departments/application/department.service')
    const { POST } = await import('./route')
    vi.mocked(DepartmentService.create).mockRejectedValueOnce(
      new DepartmentServiceError('NAME_EXISTS'),
    )

    const response = await POST(new Request('http://localhost/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'DEP-2',
        name: 'нио-904',
        parentId: null,
        headEmployeeId: null,
        isActive: true,
      }),
    }) as never)

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: {
        code: 'NAME_EXISTS',
        message: 'Подразделение с таким названием уже существует',
      },
    })
  })
})
