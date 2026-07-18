import { Prisma, type PrismaClient } from '@prisma/client'
import { ServiceError } from '@/lib/errors/service-error'
import { getDb } from '@/lib/prisma'
import type {
  CreateDepartmentInput,
  UpdateDepartmentInput,
} from '../contracts/schemas'
import type {
  DepartmentHeadCandidate,
  DepartmentListItem,
} from '../contracts/types'

export type DepartmentErrorCode =
  | 'NOT_FOUND'
  | 'CODE_EXISTS'
  | 'NAME_EXISTS'
  | 'PARENT_NOT_FOUND'
  | 'HEAD_NOT_FOUND'
  | 'CYCLIC_HIERARCHY'
  | 'IN_USE'
  | 'DEPARTMENT_REQUIRED'
  | 'INACTIVE_DEPARTMENT'

export class DepartmentServiceError extends ServiceError<DepartmentErrorCode> {}

type DepartmentDbClient =
  | Pick<PrismaClient, 'department' | 'employee'>
  | Prisma.TransactionClient

const departmentInclude = {
  headEmployee: {
    select: {
      id: true,
      code: true,
      fullName: true,
    },
  },
  _count: {
    select: {
      children: true,
      employees: true,
      staffPositions: true,
      mols: true,
    },
  },
} as const

type DepartmentRecord = Prisma.DepartmentGetPayload<{ include: typeof departmentInclude }>

function normalizeCode(code: string) {
  return code.trim().toUpperCase()
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, ' ')
}

function toListItem(department: DepartmentRecord): DepartmentListItem {
  return {
    id: department.id,
    code: department.code,
    name: department.name,
    parentId: department.parentId,
    headEmployeeId: department.headEmployeeId,
    headEmployee: department.headEmployee,
    isActive: department.isActive,
    usage: department._count,
    createdAt: department.createdAt.toISOString(),
    updatedAt: department.updatedAt.toISOString(),
  }
}

function mapWriteError(error: unknown): never {
  if (error instanceof DepartmentServiceError) throw error
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2003') throw new DepartmentServiceError('IN_USE')
    if (error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : String(error.meta?.target ?? '')
      throw new DepartmentServiceError(target.includes('name') ? 'NAME_EXISTS' : 'CODE_EXISTS')
    }
  }
  throw error
}

async function ensureUnique(
  db: DepartmentDbClient,
  input: { code: string; name: string; excludeId?: string },
) {
  const duplicate = await db.department.findFirst({
    where: {
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      OR: [
        { code: { equals: input.code, mode: 'insensitive' } },
        { name: { equals: input.name, mode: 'insensitive' } },
      ],
    },
    select: { code: true, name: true },
  })
  if (!duplicate) return
  if (duplicate.code.toLocaleLowerCase('ru') === input.code.toLocaleLowerCase('ru')) {
    throw new DepartmentServiceError('CODE_EXISTS')
  }
  throw new DepartmentServiceError('NAME_EXISTS')
}

async function ensureParentDoesNotCreateCycle(
  db: DepartmentDbClient,
  departmentId: string | undefined,
  parentId: string | null | undefined,
) {
  if (!parentId) return
  const visited = new Set<string>()
  let cursor: string | null = parentId

  while (cursor) {
    if (cursor === departmentId || visited.has(cursor)) {
      throw new DepartmentServiceError('CYCLIC_HIERARCHY')
    }
    visited.add(cursor)
    const parent: { parentId: string | null } | null = await db.department.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    })
    if (!parent) throw new DepartmentServiceError('PARENT_NOT_FOUND')
    cursor = parent.parentId
  }
}

async function ensureHeadExists(db: DepartmentDbClient, headEmployeeId: string | null | undefined) {
  if (!headEmployeeId) return
  const head = await db.employee.findFirst({
    where: { id: headEmployeeId, status: { not: 'DISMISSED' } },
    select: { id: true },
  })
  if (!head) throw new DepartmentServiceError('HEAD_NOT_FOUND')
}

async function lockDepartmentHierarchy(db: Prisma.TransactionClient) {
  await db.$queryRaw`SELECT pg_advisory_xact_lock(904202607)`
}

export class DepartmentService {
  static async list(input: { activeOnly?: boolean } = {}): Promise<DepartmentListItem[]> {
    const departments = await getDb().department.findMany({
      where: input.activeOnly ? { isActive: true } : undefined,
      orderBy: [{ name: 'asc' }],
      include: departmentInclude,
    })
    return departments.map(toListItem)
  }

  static async listHeadCandidates(): Promise<DepartmentHeadCandidate[]> {
    return getDb().employee.findMany({
      where: { status: { not: 'DISMISSED' } },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        code: true,
        fullName: true,
        departmentId: true,
      },
    })
  }

  static async create(input: CreateDepartmentInput, actorId: string, requestId?: string) {
    const code = normalizeCode(input.code)
    const name = normalizeName(input.name)
    try {
      return await getDb().$transaction(async (tx) => {
        await lockDepartmentHierarchy(tx)
        await Promise.all([
          ensureUnique(tx, { code, name }),
          ensureParentDoesNotCreateCycle(tx, undefined, input.parentId),
          ensureHeadExists(tx, input.headEmployeeId),
        ])
        const department = await tx.department.create({
          data: {
            code,
            name,
            parentId: input.parentId ?? null,
            headEmployeeId: input.headEmployeeId ?? null,
            isActive: input.isActive,
          },
          include: departmentInclude,
        })
        await tx.auditLog.create({
          data: {
            userId: actorId,
            requestId,
            action: 'DEPARTMENT_CREATE',
            entityType: 'Department',
            entityId: department.id,
            details: {
              after: {
                code: department.code,
                name: department.name,
                parentId: department.parentId,
                headEmployeeId: department.headEmployeeId,
                isActive: department.isActive,
              },
            },
          },
        })
        return toListItem(department)
      })
    } catch (error) {
      return mapWriteError(error)
    }
  }

  static async update(id: string, input: UpdateDepartmentInput, actorId: string, requestId?: string) {
    try {
      return await getDb().$transaction(async (tx) => {
        await lockDepartmentHierarchy(tx)
        const current = await tx.department.findUnique({ where: { id } })
        if (!current) throw new DepartmentServiceError('NOT_FOUND')

        const code = input.code === undefined ? current.code : normalizeCode(input.code)
        const name = input.name === undefined ? current.name : normalizeName(input.name)
        const parentId = input.parentId === undefined ? current.parentId : input.parentId
        const headEmployeeId = input.headEmployeeId === undefined
          ? current.headEmployeeId
          : input.headEmployeeId

        await Promise.all([
          ensureUnique(tx, { code, name, excludeId: id }),
          ensureParentDoesNotCreateCycle(tx, id, parentId),
          ensureHeadExists(tx, headEmployeeId),
        ])

        const department = await tx.department.update({
          where: { id },
          data: {
            code,
            name,
            parentId,
            headEmployeeId,
            isActive: input.isActive ?? current.isActive,
          },
          include: departmentInclude,
        })

        if (current.name !== department.name) {
          await Promise.all([
            tx.employee.updateMany({
              where: { departmentId: id },
              data: { department: department.name },
            }),
            tx.staffSchedule.updateMany({
              where: { departmentId: id },
              data: { department: department.name },
            }),
            tx.mol.updateMany({
              where: { departmentId: id },
              data: { department: department.name },
            }),
          ])
        }

        await tx.auditLog.create({
          data: {
            userId: actorId,
            requestId,
            action: 'DEPARTMENT_UPDATE',
            entityType: 'Department',
            entityId: id,
            details: {
              before: {
                code: current.code,
                name: current.name,
                parentId: current.parentId,
                headEmployeeId: current.headEmployeeId,
                isActive: current.isActive,
              },
              after: {
                code: department.code,
                name: department.name,
                parentId: department.parentId,
                headEmployeeId: department.headEmployeeId,
                isActive: department.isActive,
              },
            },
          },
        })
        return toListItem(department)
      })
    } catch (error) {
      return mapWriteError(error)
    }
  }

  static async delete(id: string, actorId: string, requestId?: string) {
    try {
      return await getDb().$transaction(async (tx) => {
        await lockDepartmentHierarchy(tx)
        const department = await tx.department.findUnique({
          where: { id },
          include: departmentInclude,
        })
        if (!department) throw new DepartmentServiceError('NOT_FOUND')
        if (Object.values(department._count).some((count) => count > 0)) {
          throw new DepartmentServiceError('IN_USE')
        }
        await tx.department.delete({ where: { id } })
        await tx.auditLog.create({
          data: {
            userId: actorId,
            requestId,
            action: 'DEPARTMENT_DELETE',
            entityType: 'Department',
            entityId: id,
            details: { before: { code: department.code, name: department.name } },
          },
        })
        return { success: true }
      })
    } catch (error) {
      return mapWriteError(error)
    }
  }
}
