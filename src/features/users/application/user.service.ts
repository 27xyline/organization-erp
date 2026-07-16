import { hash, verify } from '@node-rs/argon2'
import type { Prisma, UserRole } from '@prisma/client'
import { getDb } from '@/lib/prisma'
import { ServiceError } from '@/lib/errors/service-error'
import type { ChangePasswordInput, CreateUserInput, UpdateUserInput } from '../contracts/schemas'

type UserServiceErrorCode =
  | 'USER_NOT_FOUND'
  | 'USERNAME_EXISTS'
  | 'CANNOT_DEACTIVATE_SELF'
  | 'LAST_ADMIN_REQUIRED'
  | 'INVALID_CURRENT_PASSWORD'

export class UserServiceError extends ServiceError<UserServiceErrorCode> {}

const userSelect = {
  id: true,
  username: true,
  name: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  lockedUntil: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect

function auditDetails(before: unknown, after: unknown): Prisma.InputJsonValue {
  return { before: before ?? null, after: after ?? null } as Prisma.InputJsonValue
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

  static async create(input: CreateUserInput, actorId: string, requestId?: string) {
    const passwordHash = await hash(input.temporaryPassword)

    try {
      return await getDb().$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            username: input.username,
            name: input.name,
            role: input.role,
            passwordHash,
            mustChangePassword: true,
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
        throw new UserServiceError('USERNAME_EXISTS')
      }
      throw error
    }
  }

  static async update(id: string, input: UpdateUserInput, actorId: string, requestId?: string) {
    if (id === actorId && input.isActive === false) {
      throw new UserServiceError('CANNOT_DEACTIVATE_SELF')
    }

    const passwordHash = input.temporaryPassword
      ? await hash(input.temporaryPassword)
      : undefined

    return getDb().$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id }, select: userSelect })
      if (!current) throw new UserServiceError('USER_NOT_FOUND')

      const removesAdmin =
        current.role === 'ADMIN' &&
        (input.role !== undefined && input.role !== 'ADMIN' || input.isActive === false)
      if (removesAdmin) {
        const activeAdmins = await tx.user.count({ where: { role: 'ADMIN', isActive: true } })
        if (activeAdmins <= 1) throw new UserServiceError('LAST_ADMIN_REQUIRED')
      }

      const updated = await tx.user.update({
        where: { id },
        data: {
          name: input.name,
          role: input.role as UserRole | undefined,
          isActive: input.isActive,
          ...(passwordHash
            ? {
                passwordHash,
                mustChangePassword: true,
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
