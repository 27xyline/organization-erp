import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/prisma'
import { GlobalSearchService } from './global-search.service'

vi.mock('@/lib/prisma', () => ({ getDb: vi.fn() }))

function createDbMock() {
  const db = {
    employee: { findMany: vi.fn() },
    asset: { findMany: vi.fn() },
    project: { findMany: vi.fn() },
    task: { findMany: vi.fn() },
    document: { findMany: vi.fn() },
  }
  vi.mocked(getDb).mockReturnValue(db as never)
  db.employee.findMany.mockResolvedValue([{ id: 'employee-1', code: 'E-7', fullName: 'Анна Смирнова', department: 'Финансы' }])
  db.asset.findMany.mockResolvedValue([{ id: 'asset-1', inventoryNumber: 'INV-7', name: 'Ноутбук' }])
  db.project.findMany.mockResolvedValue([{ id: 'project-1', code: 'PR-7', name: 'Модернизация', status: 'ACTIVE' }])
  db.task.findMany.mockResolvedValue([{
    id: 'task-1', name: 'Подготовить отчёт', projectId: 'project-1', project: { code: 'PR-7', name: 'Модернизация' },
    status: 'IN_PROGRESS',
  }])
  db.document.findMany.mockResolvedValue([{
    id: 'document-1', title: 'Акт приёма', category: 'GENERAL', status: 'SIGNED',
  }])
  return db
}

function createAccess(permissions: string[]) {
  return {
    has: vi.fn((permission: string) => permissions.includes(permission)),
    employeeWhere: vi.fn((permission: string) => ({ employeeScope: permission })),
    assetWhere: vi.fn((permission: string) => ({ assetScope: permission })),
    projectWhere: vi.fn((permission: string) => ({ projectScope: permission })),
    documentWhere: vi.fn((permission: string) => ({ documentScope: permission })),
  }
}

describe('GlobalSearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns only permission-scoped results and useful destinations', async () => {
    const db = createDbMock()
    const access = createAccess([
      'employees.read', 'assets.read', 'projects.read', 'tasks.read', 'documents.read',
    ])

    const results = await GlobalSearchService.search('Dell', access as never)

    expect(results).toEqual([
      { id: 'employee-1', type: 'employee', title: 'Анна Смирнова', subtitle: 'Табельный № E-7 · Финансы', href: '/employees/employee-1' },
      { id: 'asset-1', type: 'asset', title: 'Ноутбук', subtitle: 'Инвентарный № INV-7', href: '/assets/asset-1' },
      { id: 'project-1', type: 'project', title: 'Модернизация', subtitle: 'PR-7 · Активный', href: '/projects/project-1' },
      { id: 'task-1', type: 'task', title: 'Подготовить отчёт', subtitle: 'Задача · PR-7 Модернизация · В работе', href: '/projects/project-1' },
      { id: 'document-1', type: 'document', title: 'Акт приёма', subtitle: 'Документ · Подписан', href: '/documents/document-1' },
    ])
    expect(db.employee.findMany.mock.calls[0]?.[0].where.AND[1]).toEqual({ employeeScope: 'employees.read' })
    expect(db.asset.findMany.mock.calls[0]?.[0].where.AND[1]).toEqual({ assetScope: 'assets.read' })
    expect(db.project.findMany.mock.calls[0]?.[0].where.AND[0]).toEqual({ projectScope: 'projects.read' })
    expect(db.task.findMany.mock.calls[0]?.[0].where.AND[0].project).toEqual({ projectScope: 'tasks.read' })
    expect(db.document.findMany.mock.calls[0]?.[0].where.AND[1]).toEqual({ documentScope: 'documents.read' })
  })

  it('does not query entity types that the user cannot read', async () => {
    const db = createDbMock()
    const access = createAccess(['projects.read'])

    const results = await GlobalSearchService.search('PR-7', access as never)

    expect(results.map((result) => result.type)).toEqual(['project'])
    expect(db.employee.findMany).not.toHaveBeenCalled()
    expect(db.asset.findMany).not.toHaveBeenCalled()
    expect(db.task.findMany).not.toHaveBeenCalled()
    expect(db.document.findMany).not.toHaveBeenCalled()
    expect(db.project.findMany.mock.calls[0]?.[0].where.AND[0]).toEqual({ projectScope: 'projects.read' })
  })
})
