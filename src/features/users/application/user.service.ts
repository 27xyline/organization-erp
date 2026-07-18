import { hash, verify } from '@node-rs/argon2'
import type { Prisma, UserRole } from '@prisma/client'
import { getDb } from '@/lib/prisma'
import { ServiceError } from '@/lib/errors/service-error'
import type {
  ChangePasswordInput,
  CreateUserInput,
  RoleAssignmentInput,
  UpdateUserInput,
} from '../contracts/schemas'
import type { AppRole, ScopeMode } from '@/lib/auth/permissions'

type UserServiceErrorCode =
  | 'USER_NOT_FOUND'
  | 'USERNAME_EXISTS'
  | 'CANNOT_DEACTIVATE_SELF'
  | 'LAST_ADMIN_REQUIRED'
  | 'INVALID_CURRENT_PASSWORD'
  | 'INVALID_SCOPE_ASSIGNMENT'
  | 'INVALID_SCOPE_REFERENCE'
  | 'EMPLOYEE_LINK_REQUIRED'
  | 'EMPLOYEE_ALREADY_LINKED'

export class UserServiceError extends ServiceError<UserServiceErrorCode> {}

// Serializes administrator-removal checks across concurrent transactions.
// The value is stable application-wide and intentionally independent of user IDs.
const LAST_ADMIN_ADVISORY_LOCK_KEY = 1_735_734_988

const userSelect = {
  id: true,
  username: true,
  name: true,
  role: true,
  employeeId: true,
  employee: { select: { id: true, code: true, fullName: true } },
  roleAssignments: {
    orderBy: { role: 'asc' as const },
    select: {
      id: true,
      role: true,
      departmentScopeMode: true,
      projectScopeMode: true,
      departmentScopes: {
        orderBy: { department: { name: 'asc' as const } },
        select: { departmentId: true },
      },
      projectScopes: {
        orderBy: { project: { code: 'asc' as const } },
        select: { projectId: true },
      },
    },
  },
  isActive: true,
  mustChangePassword: true,
  lockedUntil: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect

type NormalizedAssignment = {
  role: AppRole
  departmentScopeMode: ScopeMode
  projectScopeMode: ScopeMode
  departmentIds: string[]
  projectIds: string[]
}

const scopedModes = new Set<ScopeMode>(['ALL', 'ASSIGNED'])

function normalizeAssignment(input: RoleAssignmentInput): NormalizedAssignment {
  const normalized = {
    role: input.role,
    departmentScopeMode: input.departmentScopeMode,
    projectScopeMode: input.projectScopeMode,
    departmentIds: Array.from(new Set(input.departmentIds)),
    projectIds: Array.from(new Set(input.projectIds)),
  }

  const valid = (() => {
    switch (input.role) {
      case 'ADMIN':
      case 'AUDITOR':
        return input.departmentScopeMode === 'ALL' && input.projectScopeMode === 'ALL'
      case 'EMPLOYEE':
        return input.departmentScopeMode === 'SELF' && input.projectScopeMode === 'SELF'
      case 'HR':
        return scopedModes.has(input.departmentScopeMode) && input.projectScopeMode === 'NONE'
      case 'ACCOUNTANT':
      case 'DEPARTMENT_HEAD':
        return scopedModes.has(input.departmentScopeMode) && scopedModes.has(input.projectScopeMode)
      case 'PROJECT_MANAGER':
        return input.departmentScopeMode === 'NONE' && scopedModes.has(input.projectScopeMode)
      case 'ASSET_CUSTODIAN':
        return scopedModes.has(input.departmentScopeMode) && input.projectScopeMode === 'NONE'
    }
  })()

  if (!valid) throw new UserServiceError('INVALID_SCOPE_ASSIGNMENT')
  if (input.departmentScopeMode !== 'ASSIGNED') normalized.departmentIds = []
  if (input.projectScopeMode !== 'ASSIGNED') normalized.projectIds = []
  return normalized
}

function normalizeAssignments(assignments: RoleAssignmentInput[]): NormalizedAssignment[] {
  return assignments.map(normalizeAssignment)
}

function compatibilityRole(assignments: readonly { role: AppRole }[]): UserRole {
  if (assignments.some((assignment) => assignment.role === 'ADMIN')) return 'ADMIN'
  if (assignments.some((assignment) => !['AUDITOR', 'EMPLOYEE'].includes(assignment.role))) {
    return 'EDITOR'
  }
  return 'VIEWER'
}

function assignmentCreates(assignments: readonly NormalizedAssignment[]) {
  return assignments.map((assignment) => ({
    role: assignment.role,
    departmentScopeMode: assignment.departmentScopeMode,
    projectScopeMode: assignment.projectScopeMode,
    departmentScopes: assignment.departmentIds.length
      ? { create: assignment.departmentIds.map((departmentId) => ({ departmentId })) }
      : undefined,
    projectScopes: assignment.projectIds.length
      ? { create: assignment.projectIds.map((projectId) => ({ projectId })) }
      : undefined,
  }))
}

function auditDetails(before: unknown, after: unknown): Prisma.InputJsonValue {
  return { before: before ?? null, after: after ?? null } as Prisma.InputJsonValue
}

async function validateReferences(
  tx: Prisma.TransactionClient,
  assignments: readonly NormalizedAssignment[],
  employeeId: string | null | undefined,
) {
  const departmentIds = Array.from(new Set(assignments.flatMap((assignment) => assignment.departmentIds)))
  const projectIds = Array.from(new Set(assignments.flatMap((assignment) => assignment.projectIds)))
  const [departmentCount, projectCount, employeeCount] = await Promise.all([
    departmentIds.length ? tx.department.count({ where: { id: { in: departmentIds } } }) : 0,
    projectIds.length ? tx.project.count({ where: { id: { in: projectIds } } }) : 0,
    employeeId ? tx.employee.count({ where: { id: employeeId } }) : 0,
  ])
  if (
    departmentCount !== departmentIds.length ||
    projectCount !== projectIds.length ||
    (employeeId && employeeCount !== 1)
  ) {
    throw new UserServiceError('INVALID_SCOPE_REFERENCE')
  }
  if (assignments.some((assignment) => assignment.role === 'EMPLOYEE') && !employeeId) {
    throw new UserServiceError('EMPLOYEE_LINK_REQUIRED')
  }
}

export class UserService {
  static async list(input: { page: number; pageSize: number }) {
    const db = getDb()
    const skip = (input.page - 1) * input.pageSize
    const [users, total] = await db.$transaction([
      db.user.findMany({
        select: userSelect,
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        skip,
        take: input.pageSize,
      }),
      db.user.count(),
    ])
    return { users, total }
  }

  static async references() {
    const db = getDb()
    const [departments, projects, employees] = await Promise.all([
      db.department.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, parentId: true },
        orderBy: { name: 'asc' },
      }),
      db.project.findMany({
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
      db.employee.findMany({
        where: { status: { not: 'DISMISSED' } },
        select: { id: true, code: true, fullName: true, departmentId: true },
        orderBy: { fullName: 'asc' },
      }),
    ])
    return { departments, projects, employees }
  }

  static async create(input: CreateUserInput, actorId: string, requestId?: string) {
    const passwordHash = await hash(input.temporaryPassword)
    const assignments = normalizeAssignments(input.assignments)
    try {
      return await getDb().$transaction(async (tx) => {
        await validateReferences(tx, assignments, input.employeeId)
        const user = await tx.user.create({
          data: {
            username: input.username,
            name: input.name,
            employeeId: input.employeeId || null,
            role: compatibilityRole(assignments),
            passwordHash,
            mustChangePassword: true,
            roleAssignments: { create: assignmentCreates(assignments) },
          },
          select: userSelect,
        })
        await tx.auditLog.create({
          data: {
            userId: actorId,
            action: 'USER_CREATE',
            entityType: 'User',
            entityId: user.id,
            requestId,
            details: auditDetails(null, user),
          },
        })
        return user
      })
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        if ((error as { meta?: { target?: string[] } }).meta?.target?.includes('employeeId')) {
          throw new UserServiceError('EMPLOYEE_ALREADY_LINKED')
        }
        throw new UserServiceError('USERNAME_EXISTS')
      }
      throw error
    }
  }

  static async update(id: string, input: UpdateUserInput, actorId: string, requestId?: string) {
    if (id === actorId && input.isActive === false) {
      throw new UserServiceError('CANNOT_DEACTIVATE_SELF')
    }
    const passwordHash = input.temporaryPassword ? await hash(input.temporaryPassword) : undefined

    try {
      return await getDb().$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(${LAST_ADMIN_ADVISORY_LOCK_KEY})`
        const current = await tx.user.findUnique({ where: { id }, select: userSelect })
        if (!current) throw new UserServiceError('USER_NOT_FOUND')

        const assignments = input.assignments
          ? normalizeAssignments(input.assignments)
          : current.roleAssignments.map((assignment) => ({
              role: assignment.role,
              departmentScopeMode: assignment.departmentScopeMode,
              projectScopeMode: assignment.projectScopeMode,
              departmentIds: assignment.departmentScopes.map((scope) => scope.departmentId),
              projectIds: assignment.projectScopes.map((scope) => scope.projectId),
            }))
        const employeeId = input.employeeId === undefined ? current.employeeId : input.employeeId
        await validateReferences(tx, assignments, employeeId)

        const removesAdmin = current.roleAssignments.some((assignment) => assignment.role === 'ADMIN') &&
          (
            !assignments.some((assignment) => assignment.role === 'ADMIN') ||
            input.isActive === false
          )
        if (removesAdmin) {
          const activeAdmins = await tx.user.count({
            where: {
              isActive: true,
              roleAssignments: { some: { role: 'ADMIN' } },
            },
          })
          if (activeAdmins <= 1) throw new UserServiceError('LAST_ADMIN_REQUIRED')
        }

        const updated = await tx.user.update({
          where: { id },
          data: {
            name: input.name,
            employeeId,
            role: compatibilityRole(assignments),
            isActive: input.isActive,
            ...(input.assignments
              ? {
                  roleAssignments: {
                    deleteMany: {},
                    create: assignmentCreates(assignments),
                  },
                }
              : {}),
            ...(passwordHash
              ? {
                  passwordHash,
                  mustChangePassword: true,
                  sessionVersion: { increment: 1 },
                  passwordChangedAt: new Date(),
                  failedLoginAttempts: 0,
                  lockedUntil: null,
                }
              : {}),
          },
          select: userSelect,
        })

        await tx.auditLog.create({
          data: {
            userId: actorId,
            action: 'USER_UPDATE',
            entityType: 'User',
            entityId: id,
            requestId,
            details: auditDetails(current, updated),
          },
        })
        return updated
      })
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new UserServiceError('EMPLOYEE_ALREADY_LINKED')
      }
      throw error
    }
  }

  static async changePassword(userId: string, input: ChangePasswordInput, requestId?: string) {
    const db = getDb()
    const current = await db.user.findUnique({ where: { id: userId } })
    if (!current) throw new UserServiceError('USER_NOT_FOUND')
    if (!(await verify(current.passwordHash, input.currentPassword))) {
      throw new UserServiceError('INVALID_CURRENT_PASSWORD')
    }
    const passwordHash = await hash(input.newPassword)
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          sessionVersion: { increment: 1 },
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      })
      await tx.auditLog.create({
        data: {
          userId,
          action: 'PASSWORD_CHANGE',
          entityType: 'User',
          entityId: userId,
          requestId,
          details: { changed: true },
        },
      })
    })
  }
}
