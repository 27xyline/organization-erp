import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'

const authMocks = vi.hoisted(() => ({
  allows: vi.fn(() => true),
}))

const dbMocks = vi.hoisted(() => {
  const db = {
    projectMember: { findMany: vi.fn() },
    task: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    ...db,
    $transaction: vi.fn(async (callback: (tx: typeof db) => unknown) => callback(db)),
  }
})

vi.mock('@/lib/auth/authorization', () => ({
  authorizeApiRequest: vi.fn(async () => ({
    user: { id: 'admin-1', username: 'admin', name: 'Admin', role: 'ADMIN' },
    access: { allows: authMocks.allows },
    requestId: 'request-1',
  })),
}))

vi.mock('@/lib/prisma', () => ({ prisma: dbMocks }))

describe('projects/[id]/tasks route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a root task', async () => {
    const { POST } = await import('@/app/api/projects/[id]/tasks/route')

    vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce([])
    vi.mocked(prisma.task.create).mockResolvedValueOnce({
      id: 'task-1',
      name: 'Корневая задача',
      level: 1,
      parentId: null,
      assignees: [],
    } as never)

    const response = await POST(
      new Request('http://localhost/api/projects/project-1/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Корневая задача',
          level: 1,
        }),
      }) as never,
      { params: Promise.resolve({ id: 'project-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(prisma.task.findUnique).not.toHaveBeenCalled()
    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Корневая задача',
          level: 1,
          parentId: null,
          projectId: 'project-1',
        }),
      })
    )
    expect(body.data).toEqual(
      expect.objectContaining({
        id: 'task-1',
        name: 'Корневая задача',
        assignees: [],
      })
    )
  })

  it('creates a subtask when parent belongs to the project and level matches', async () => {
    const { POST } = await import('@/app/api/projects/[id]/tasks/route')

    vi.mocked(prisma.task.findUnique).mockResolvedValueOnce({
      projectId: 'project-1',
      level: 1,
    } as never)
    vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce([])
    vi.mocked(prisma.task.create).mockResolvedValueOnce({
      id: 'task-2',
      name: 'Подзадача',
      level: 2,
      parentId: 'task-1',
      assignees: [],
    } as never)

    const response = await POST(
      new Request('http://localhost/api/projects/project-1/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Подзадача',
          level: 2,
          parentId: 'task-1',
        }),
      }) as never,
      { params: Promise.resolve({ id: 'project-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(prisma.task.findUnique).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      select: {
        projectId: true,
        level: true,
      },
    })
    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          level: 2,
          parentId: 'task-1',
          projectId: 'project-1',
        }),
      })
    )
    expect(body.data).toEqual(
      expect.objectContaining({
        id: 'task-2',
        parentId: 'task-1',
        assignees: [],
      })
    )
  })

  it('rejects root task creation when level is not 1', async () => {
    const { POST } = await import('@/app/api/projects/[id]/tasks/route')

    const response = await POST(
      new Request('http://localhost/api/projects/project-1/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Некорректная корневая задача',
          level: 2,
        }),
      }) as never,
      { params: Promise.resolve({ id: 'project-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({ error: { message: 'Корневая задача должна иметь уровень 1' } })
    expect(prisma.projectMember.findMany).not.toHaveBeenCalled()
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it('rejects task creation when parent does not exist', async () => {
    const { POST } = await import('@/app/api/projects/[id]/tasks/route')

    vi.mocked(prisma.task.findUnique).mockResolvedValueOnce(null)

    const response = await POST(
      new Request('http://localhost/api/projects/project-1/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Подзадача',
          level: 2,
          parentId: 'missing-task',
        }),
      }) as never,
      { params: Promise.resolve({ id: 'project-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({ error: { message: 'Родительская задача не найдена' } })
    expect(prisma.projectMember.findMany).not.toHaveBeenCalled()
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it('rejects task creation when parent is already on the third level', async () => {
    const { POST } = await import('@/app/api/projects/[id]/tasks/route')

    vi.mocked(prisma.task.findUnique).mockResolvedValueOnce({
      projectId: 'project-1',
      level: 3,
    } as never)

    const response = await POST(
      new Request('http://localhost/api/projects/project-1/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Слишком глубокая подзадача',
          level: 3,
          parentId: 'task-level-3',
        }),
      }) as never,
      { params: Promise.resolve({ id: 'project-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({ error: { message: 'Нельзя создать подзадачу глубже третьего уровня' } })
    expect(prisma.task.findUnique).toHaveBeenCalledWith({
      where: { id: 'task-level-3' },
      select: {
        projectId: true,
        level: true,
      },
    })
    expect(prisma.projectMember.findMany).not.toHaveBeenCalled()
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it('rejects task creation when parent belongs to another project', async () => {
    const { POST } = await import('@/app/api/projects/[id]/tasks/route')

    vi.mocked(prisma.task.findUnique).mockResolvedValueOnce({
      projectId: 'project-2',
      level: 1,
    } as never)

    const response = await POST(
      new Request('http://localhost/api/projects/project-1/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Подзадача',
          level: 2,
          parentId: 'task-from-another-project',
        }),
      }) as never,
      { params: Promise.resolve({ id: 'project-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({ error: { message: 'Родительская задача должна принадлежать этому проекту' } })
    expect(prisma.projectMember.findMany).not.toHaveBeenCalled()
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it('rejects task creation when subtask level does not match parent level', async () => {
    const { POST } = await import('@/app/api/projects/[id]/tasks/route')

    vi.mocked(prisma.task.findUnique).mockResolvedValueOnce({
      projectId: 'project-1',
      level: 1,
    } as never)

    const response = await POST(
      new Request('http://localhost/api/projects/project-1/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Подзадача',
          level: 3,
          parentId: 'task-1',
        }),
      }) as never,
      { params: Promise.resolve({ id: 'project-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({ error: { message: 'Уровень подзадачи должен быть на один больше уровня родительской задачи' } })
    expect(prisma.projectMember.findMany).not.toHaveBeenCalled()
    expect(prisma.task.create).not.toHaveBeenCalled()
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
      { params: Promise.resolve({ id: 'project-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({ error: { message: 'Можно назначать только активных участников проекта' } })
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
      { params: Promise.resolve({ id: 'project-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data[0].assignees).toEqual([
      {
        employeeId: 'emp-1',
        fullName: 'Иван Иванов',
        projectMemberId: 'member-1',
      },
    ])
  })
})
