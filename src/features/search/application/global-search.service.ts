import { Prisma } from '@prisma/client'
import { DOCUMENT_STATUS_LABELS } from '@/features/documents/contracts/ui-types'
import { ProjectStatusLabels, TaskStatusLabels } from '@/features/projects/contracts/types'
import type { GlobalSearchItem } from '../contracts/search'
import type { AccessContext } from '@/lib/auth/access-context'
import { getDb } from '@/lib/prisma'

const RESULT_LIMIT = 5

export class GlobalSearchService {
  static async search(query: string, access: AccessContext): Promise<GlobalSearchItem[]> {
    const db = getDb()
    const contains = { contains: query, mode: 'insensitive' as const }
    const [employees, assets, projects, tasks, documents] = await Promise.all([
      access.has('employees.read')
        ? db.employee.findMany({
            where: {
              AND: [
                { status: { not: 'DISMISSED' } },
                access.employeeWhere('employees.read') as Prisma.EmployeeWhereInput,
                { OR: [{ fullName: contains }, { code: contains }, { department: contains }] },
              ],
            },
            select: { id: true, code: true, fullName: true, department: true },
            orderBy: { fullName: 'asc' },
            take: RESULT_LIMIT,
          })
        : Promise.resolve([]),
      access.has('assets.read')
        ? db.asset.findMany({
            where: {
              AND: [
                { isArchived: false },
                access.assetWhere('assets.read') as Prisma.AssetWhereInput,
                { OR: [{ name: contains }, { inventoryNumber: contains }, { documentDetails: contains }] },
              ],
            },
            select: { id: true, inventoryNumber: true, name: true },
            orderBy: { orderNumber: 'desc' },
            take: RESULT_LIMIT,
          })
        : Promise.resolve([]),
      access.has('projects.read')
        ? db.project.findMany({
            where: {
              AND: [
                access.projectWhere('projects.read') as Prisma.ProjectWhereInput,
                { OR: [{ code: contains }, { name: contains }, { description: contains }] },
              ],
            },
            select: { id: true, code: true, name: true, status: true },
            orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
            take: RESULT_LIMIT,
          })
        : Promise.resolve([]),
      access.has('tasks.read')
        ? db.task.findMany({
            where: {
              AND: [
                { project: access.projectWhere('tasks.read') as Prisma.ProjectWhereInput },
                { OR: [{ name: contains }, { description: contains }, { responsible: contains }] },
              ],
            },
            select: {
              id: true,
              name: true,
              projectId: true,
              project: { select: { code: true, name: true } },
              status: true,
            },
            orderBy: { updatedAt: 'desc' },
            take: RESULT_LIMIT,
          })
        : Promise.resolve([]),
      access.has('documents.read')
        ? db.document.findMany({
            where: {
              AND: [
                { archivedAt: null },
                access.documentWhere('documents.read') as Prisma.DocumentWhereInput,
                {
                  OR: [
                    { title: contains },
                    { description: contains },
                    { versions: { some: { originalFilename: contains } } },
                  ],
                },
              ],
            },
            select: { id: true, title: true, category: true, status: true },
            orderBy: { updatedAt: 'desc' },
            take: RESULT_LIMIT,
          })
        : Promise.resolve([]),
    ])

    return [
      ...employees.map((employee) => ({
        id: employee.id,
        type: 'employee' as const,
        title: employee.fullName,
        subtitle: `Табельный № ${employee.code} · ${employee.department}`,
        href: `/employees/${employee.id}`,
      })),
      ...assets.map((asset) => ({
        id: asset.id,
        type: 'asset' as const,
        title: asset.name,
        subtitle: `Инвентарный № ${asset.inventoryNumber}`,
        href: `/assets/${asset.id}`,
      })),
      ...projects.map((project) => ({
        id: project.id,
        type: 'project' as const,
        title: project.name,
        subtitle: `${project.code} · ${ProjectStatusLabels[project.status]}`,
        href: `/projects/${project.id}`,
      })),
      ...tasks.map((task) => ({
        id: task.id,
        type: 'task' as const,
        title: task.name,
        subtitle: `Задача · ${task.project.code} ${task.project.name} · ${TaskStatusLabels[task.status]}`,
        href: `/projects/${task.projectId}`,
      })),
      ...documents.map((document) => ({
        id: document.id,
        type: 'document' as const,
        title: document.title,
        subtitle: `Документ · ${DOCUMENT_STATUS_LABELS[document.status]}`,
        href: `/documents/${document.id}`,
      })),
    ]
  }
}
