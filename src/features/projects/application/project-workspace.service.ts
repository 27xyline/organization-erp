import { getDb } from '@/lib/prisma'

export class ProjectWorkspaceService {
  static async activity(
    projectId: string,
    visibility: { canReadTasks: boolean; canReadDocuments: boolean; canReadAll: boolean },
  ) {
    const db = getDb()
    const [tasks, documents] = await Promise.all([
      visibility.canReadTasks || visibility.canReadAll
        ? db.task.findMany({ where: { projectId }, select: { id: true } })
        : Promise.resolve([]),
      visibility.canReadDocuments || visibility.canReadAll
        ? db.document.findMany({ where: { projectId }, select: { id: true } })
        : Promise.resolve([]),
    ])
    const taskIds = tasks.map((task) => task.id)
    const documentIds = documents.map((document) => document.id)
    return db.auditLog.findMany({
      where: {
        OR: [
          { entityType: 'Project', entityId: projectId },
          ...((visibility.canReadTasks || visibility.canReadAll) && taskIds.length
            ? [{ entityType: 'Task', entityId: { in: taskIds } }]
            : []),
          ...((visibility.canReadDocuments || visibility.canReadAll) && documentIds.length
            ? [{ entityType: 'Document', entityId: { in: documentIds } }]
            : []),
        ],
      },
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        user: { select: { id: true, name: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
  }
}
