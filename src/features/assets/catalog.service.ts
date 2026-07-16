import { Prisma } from '@prisma/client'
import { getDb } from '@/lib/prisma'
import { ServiceError } from '@/lib/services/service-error'
import type { CreateGroupInput, CreateMolInput } from '@/features/assets/contracts/schemas'

type CatalogErrorCode = 'NOT_FOUND' | 'CODE_EXISTS' | 'IN_USE'
export class CatalogServiceError extends ServiceError<CatalogErrorCode> {}

function isPrismaError(error: unknown, code: string) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
}

export class CatalogService {
  static listGroups() {
    return getDb().assetGroup.findMany({ orderBy: { code: 'asc' } })
  }

  static listMols() {
    return getDb().mol.findMany({ orderBy: { code: 'asc' } })
  }

  static getGroup(id: string) {
    return getDb().assetGroup.findUnique({
      where: { id },
      include: { _count: { select: { assets: true } } },
    })
  }

  static getMol(id: string) {
    return getDb().mol.findUnique({
      where: { id },
      include: { _count: { select: { holdings: true, assets: true } } },
    })
  }

  static async createGroup(input: CreateGroupInput, actorId: string, requestId?: string) {
    try {
      return await getDb().$transaction(async (tx) => {
        const group = await tx.assetGroup.create({ data: input })
        await tx.auditLog.create({
          data: {
            userId: actorId, requestId, action: 'ASSET_GROUP_CREATE', entityType: 'AssetGroup',
            entityId: group.id, details: { after: { id: group.id, code: group.code, name: group.name } },
          },
        })
        return group
      })
    } catch (error) {
      if (isPrismaError(error, 'P2002')) throw new CatalogServiceError('CODE_EXISTS')
      throw error
    }
  }

  static async updateGroup(id: string, input: CreateGroupInput, actorId: string, requestId?: string) {
    try {
      return await getDb().$transaction(async (tx) => {
        const current = await tx.assetGroup.findUnique({ where: { id } })
        if (!current) throw new CatalogServiceError('NOT_FOUND')
        const group = await tx.assetGroup.update({ where: { id }, data: input })
        await tx.auditLog.create({
          data: {
            userId: actorId, requestId, action: 'ASSET_GROUP_UPDATE', entityType: 'AssetGroup', entityId: id,
            details: {
              before: { code: current.code, name: current.name },
              after: { code: group.code, name: group.name },
            },
          },
        })
        return group
      })
    } catch (error) {
      if (isPrismaError(error, 'P2002')) throw new CatalogServiceError('CODE_EXISTS')
      throw error
    }
  }

  static async deleteGroup(id: string, actorId: string, requestId?: string) {
    try {
      return await getDb().$transaction(async (tx) => {
        const current = await tx.assetGroup.findUnique({ where: { id } })
        if (!current) throw new CatalogServiceError('NOT_FOUND')
        await tx.assetGroup.delete({ where: { id } })
        await tx.auditLog.create({
          data: {
            userId: actorId, requestId, action: 'ASSET_GROUP_DELETE', entityType: 'AssetGroup', entityId: id,
            details: { before: { code: current.code, name: current.name } },
          },
        })
        return { success: true }
      })
    } catch (error) {
      if (isPrismaError(error, 'P2003')) throw new CatalogServiceError('IN_USE')
      throw error
    }
  }

  static async createMol(input: CreateMolInput, actorId: string, requestId?: string) {
    try {
      return await getDb().$transaction(async (tx) => {
        const mol = await tx.mol.create({ data: input })
        await tx.auditLog.create({
          data: {
            userId: actorId, requestId, action: 'MOL_CREATE', entityType: 'Mol', entityId: mol.id,
            details: { after: { id: mol.id, code: mol.code, fullName: mol.fullName } },
          },
        })
        return mol
      })
    } catch (error) {
      if (isPrismaError(error, 'P2002')) throw new CatalogServiceError('CODE_EXISTS')
      throw error
    }
  }

  static async updateMol(id: string, input: CreateMolInput, actorId: string, requestId?: string) {
    try {
      return await getDb().$transaction(async (tx) => {
        const current = await tx.mol.findUnique({ where: { id } })
        if (!current) throw new CatalogServiceError('NOT_FOUND')
        const mol = await tx.mol.update({ where: { id }, data: input })
        await tx.auditLog.create({
          data: {
            userId: actorId, requestId, action: 'MOL_UPDATE', entityType: 'Mol', entityId: id,
            details: {
              before: { code: current.code, fullName: current.fullName },
              after: { code: mol.code, fullName: mol.fullName },
            },
          },
        })
        return mol
      })
    } catch (error) {
      if (isPrismaError(error, 'P2002')) throw new CatalogServiceError('CODE_EXISTS')
      throw error
    }
  }

  static async deleteMol(id: string, actorId: string, requestId?: string) {
    try {
      return await getDb().$transaction(async (tx) => {
        const current = await tx.mol.findUnique({ where: { id } })
        if (!current) throw new CatalogServiceError('NOT_FOUND')
        await tx.mol.delete({ where: { id } })
        await tx.auditLog.create({
          data: {
            userId: actorId, requestId, action: 'MOL_DELETE', entityType: 'Mol', entityId: id,
            details: { before: { code: current.code, fullName: current.fullName } },
          },
        })
        return { success: true }
      })
    } catch (error) {
      if (isPrismaError(error, 'P2003')) throw new CatalogServiceError('IN_USE')
      throw error
    }
  }
}
