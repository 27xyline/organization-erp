import { getDb } from '@/lib/prisma'

export class ProjectWorkspaceService {
  static async activity(projectId: string) {
    const db = getDb()
    const [tasks, documents] = await Promise.all([
      db.task.findMany({ where: { projectId }, select: { id: true } }),
      db.document.findMany({ where: { projectId }, select: { id: true } }),
    ])
    const taskIds = tasks.map((task) => task.id)
    const documentIds = documents.map((document) => document.id)
    return db.auditLog.findMany({
      where: {
        OR: [
          { entityType: 'Project', entityId: projectId },
          ...(taskIds.length ? [{ entityType: 'Task', entityId: { in: taskIds } }] : []),
          ...(documentIds.length ? [{ entityType: 'Document', entityId: { in: documentIds } }] : []),
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
