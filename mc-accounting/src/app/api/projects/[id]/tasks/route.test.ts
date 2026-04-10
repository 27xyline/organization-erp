import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    projectMember: {
      findMany: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}))

describe('projects/[id]/tasks route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects task creation when assignee is not in active project members', async () => {
    const { POST } = await import('@/app/api/projects/[id]/tasks/route')

    vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce([])

    const response = await POST(
      new Request('http://localhost/api/projects/project-1/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Новая задача',
          employeeIds: ['emp-1'],
        }),
      }) as never,
      { params: { id: 'project-1' } }
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Можно назначать только активных участников проекта' })
  })

  it('returns normalized assignees on GET', async () => {
    const { GET } = await import('@/app/api/projects/[id]/tasks/route')

    vi.mocked(prisma.task.findMany).mockResolvedValueOnce([
      {
        id: 'task-1',
        name: 'Задача',
        assignees: [
          {
            employeeId: 'emp-1',
            projectMemberId: 'member-1',
            employee: {
              fullName: 'Иван Иванов',
            },
          },
        ],
        children: [],
      },
    ] as never)

    const response = await GET(
      new NextRequest('http://localhost/api/projects/project-1/tasks'),
      { params: { id: 'project-1' } }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body[0].assignees).toEqual([
      {
        employeeId: 'emp-1',
        fullName: 'Иван Иванов',
        projectMemberId: 'member-1',
      },
    ])
  })
})
