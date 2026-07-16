import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceError } from '@/lib/errors/service-error'

vi.mock('@/lib/auth/authorization', () => ({
  authorizeApiRequest: vi.fn(async () => ({
    user: { id: 'admin-1', username: 'admin', name: 'Admin', role: 'ADMIN' },
  })),
}))

vi.mock('@/lib/services/project-member.service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/project-member.service')>('@/lib/services/project-member.service')

  return {
    ...actual,
    ProjectMemberService: {
      getMembers: vi.fn(),
      addMember: vi.fn(),
      updateMember: vi.fn(),
    },
  }
})

describe('projects/[id]/members route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps project member service errors to api response', async () => {
    const { ProjectMemberService } = await import('@/lib/services/project-member.service')
    const { POST } = await import('@/app/api/projects/[id]/members/route')

    vi.mocked(ProjectMemberService.addMember).mockRejectedValueOnce(new ServiceError('EMPLOYEE_DISMISSED'))

    const response = await POST(
      new Request('http://localhost/api/projects/project-1/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: 'emp-1',
        }),
      }) as never,
      { params: Promise.resolve({ id: 'project-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Нельзя добавить уволенного сотрудника' })
  })

  it('returns validation error when employeeId is missing', async () => {
    const { POST } = await import('@/app/api/projects/[id]/members/route')

    const response = await POST(
      new Request('http://localhost/api/projects/project-1/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }) as never,
      { params: Promise.resolve({ id: 'project-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Сотрудник обязателен' })
  })

  it('passes through GET to member service', async () => {
    const { ProjectMemberService } = await import('@/lib/services/project-member.service')
    const { GET } = await import('@/app/api/projects/[id]/members/route')

    vi.mocked(ProjectMemberService.getMembers).mockResolvedValueOnce({
      members: [],
      availableEmployees: [],
    })

    const response = await GET(
      new NextRequest('http://localhost/api/projects/project-1/members'),
      { params: Promise.resolve({ id: 'project-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ members: [], availableEmployees: [] })
  })
})
