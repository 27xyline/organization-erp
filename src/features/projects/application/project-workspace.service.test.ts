import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectWorkspaceService } from './project-workspace.service'

const database = vi.hoisted(() => ({
  task: { findMany: vi.fn() },
  document: { findMany: vi.fn() },
  auditLog: { findMany: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({ getDb: () => database }))

describe('ProjectWorkspaceService activity visibility', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns only project events when the reader has no task, document, or audit access', async () => {
    await ProjectWorkspaceService.activity('project-1', {
      canReadTasks: false,
      canReadDocuments: false,
      canReadAll: false,
    })

    expect(database.task.findMany).not.toHaveBeenCalled()
    expect(database.document.findMany).not.toHaveBeenCalled()
    expect(database.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ entityType: 'Project', entityId: 'project-1' }] },
    }))
  })

  it('includes task events only when the reader can access project tasks', async () => {
    database.task.findMany.mockResolvedValueOnce([{ id: 'task-1' }])

    await ProjectWorkspaceService.activity('project-1', {
      canReadTasks: true,
      canReadDocuments: false,
      canReadAll: false,
    })

    expect(database.task.findMany).toHaveBeenCalledWith({ where: { projectId: 'project-1' }, select: { id: true } })
    expect(database.document.findMany).not.toHaveBeenCalled()
    expect(database.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [
        { entityType: 'Project', entityId: 'project-1' },
        { entityType: 'Task', entityId: { in: ['task-1'] } },
      ] },
    }))
  })

  it('includes every related event for readers with global audit access', async () => {
    database.task.findMany.mockResolvedValueOnce([{ id: 'task-1' }])
    database.document.findMany.mockResolvedValueOnce([{ id: 'document-1' }])

    await ProjectWorkspaceService.activity('project-1', {
      canReadTasks: false,
      canReadDocuments: false,
      canReadAll: true,
    })

    expect(database.task.findMany).toHaveBeenCalledOnce()
    expect(database.document.findMany).toHaveBeenCalledOnce()
    expect(database.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [
        { entityType: 'Project', entityId: 'project-1' },
        { entityType: 'Task', entityId: { in: ['task-1'] } },
        { entityType: 'Document', entityId: { in: ['document-1'] } },
      ] },
    }))
  })
})
