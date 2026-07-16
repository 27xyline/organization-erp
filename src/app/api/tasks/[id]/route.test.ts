import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    projectMember: {
      findMany: vi.fn(),
    },
    task: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

describe('tasks/[id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 404 when updating a missing task', async () => {
    const { PUT } = await import('@/app/api/tasks/[id]/route')

    vi.mocked(prisma.task.findUnique).mockResolvedValueOnce(null)

    const response = await PUT(
      new Request('http://localhost/api/tasks/task-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Обновлённая задача',
        }),
      }) as never,
      { params: { id: 'task-1' } }
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'Задача не найдена' })
  })

  it('rejects update when assignee is outside active project members', async () => {
    const { PUT } = await import('@/app/api/tasks/[id]/route')

    vi.mocked(prisma.task.findUnique).mockResolvedValueOnce({
      id: 'task-1',
      projectId: 'project-1',
    } as never)
    vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce([])

    const response = await PUT(
      new Request('http://localhost/api/tasks/task-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeIds: ['emp-1'],
        }),
      }) as never,
      { params: { id: 'task-1' } }
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Можно назначать только активных участников проекта' })
  })
})
