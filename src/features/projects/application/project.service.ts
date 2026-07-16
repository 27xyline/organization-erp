import { Prisma } from '@prisma/client'
import { getDb } from '@/lib/prisma'
import { ServiceError } from '@/lib/errors/service-error'
import type { CreateProjectInput } from '../contracts/project'

type ProjectErrorCode = 'PROJECT_NOT_FOUND' | 'PROJECT_CODE_EXISTS'
export class ProjectServiceError extends ServiceError<ProjectErrorCode> {}

const projectListInclude = { _count: { select: { assets: true, tasksList: true } } } as const

function projectData(input: CreateProjectInput) {
  return {
    code: input.code,
    name: input.name,
    description: input.description || null,
    goals: input.goals || null,
    tasks: input.tasks || null,
    results: input.results || null,
    startDate: input.startDate ? new Date(input.startDate) : null,
    endDate: input.endDate ? new Date(input.endDate) : null,
    plannedBudget: new Prisma.Decimal(input.plannedBudget || 0),
    actualBudget: new Prisma.Decimal(input.actualBudget || 0),
    status: input.status,
  }
}

export class ProjectService {
  static async list(input: { page: number; pageSize: number; status?: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED' }) {
    const db = getDb()
    const where = input.status ? { status: input.status } : undefined
    const [projects, total] = await db.$transaction([
      db.project.findMany({
        where, include: projectListInclude, orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize, take: input.pageSize,
      }),
      db.project.count({ where }),
    ])
    return { projects, total }
  }

  static getForApi(id: string) {
    return getDb().project.findUnique({
      where: { id },
      include: {
        tasksList: { orderBy: { createdAt: 'asc' }, include: { children: { include: { children: true } } } },
        assets: { include: { mol: true, group: true, holdings: { include: { mol: true } } } },
        ...projectListInclude,
      },
    })
  }

  static getDetail(id: string) {
    return getDb().project.findUnique({
      where: { id },
      include: {
        tasksList: {
          orderBy: { createdAt: 'asc' },
          include: { assignees: { include: { employee: { select: { id: true, fullName: true } } } } },
        },
        assets: {
          include: {
            mol: true, group: true,
            operations: { where: { type: { in: ['RECEIPT', 'DISPOSAL'] } }, orderBy: { date: 'desc' } },
          },
        },
        financePlanEntries: {
          include: { employee: { select: { id: true, fullName: true, department: true } } },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { assets: true, tasksList: true, financePlanEntries: true } },
      },
    })
  }

  static async create(input: CreateProjectInput, actorId: string, requestId?: string) {
    try {
      return await getDb().$transaction(async (tx) => {
        const project = await tx.project.create({ data: projectData(input) })
        await tx.auditLog.create({
          data: {
            userId: actorId, requestId, action: 'PROJECT_CREATE', entityType: 'Project', entityId: project.id,
            details: { after: { code: project.code, name: project.name, status: project.status } },
          },
        })
        return project
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ProjectServiceError('PROJECT_CODE_EXISTS')
      }
      throw error
    }
  }

  static async update(id: string, input: CreateProjectInput, actorId: string, requestId?: string) {
    return getDb().$transaction(async (tx) => {
      const before = await tx.project.findUnique({ where: { id } })
      if (!before) throw new ProjectServiceError('PROJECT_NOT_FOUND')
      const project = await tx.project.update({ where: { id }, data: projectData(input) })
      await tx.auditLog.create({
        data: {
          userId: actorId, requestId, action: 'PROJECT_UPDATE', entityType: 'Project', entityId: id,
          details: {
            before: { code: before.code, name: before.name, status: before.status },
            after: { code: project.code, name: project.name, status: project.status },
          },
        },
      })
      return project
    })
  }

  static async delete(id: string, actorId: string, requestId?: string) {
    return getDb().$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id } })
      if (!project) throw new ProjectServiceError('PROJECT_NOT_FOUND')
      await tx.project.delete({ where: { id } })
      await tx.auditLog.create({
        data: {
          userId: actorId, requestId, action: 'PROJECT_DELETE', entityType: 'Project', entityId: id,
          details: { before: { code: project.code, name: project.name } },
        },
      })
      return { success: true }
    })
  }
}
