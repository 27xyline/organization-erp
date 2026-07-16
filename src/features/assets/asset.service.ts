import { AssetStatus, OperationType, Prisma } from '@prisma/client'
import type { CreateAssetInput } from '@/features/assets/contracts/schemas'
import { getDb } from '@/lib/prisma'
import { ServiceError } from '@/lib/services/service-error'
import type { AssetsQuery, DisposeAssetInput, OperationsQuery, TransferAssetInput, UpdateAssetInput } from './contracts/schemas'

type AssetServiceErrorCode =
  | 'ASSET_NOT_FOUND'
  | 'ASSET_ARCHIVED'
  | 'HOLDING_NOT_FOUND'
  | 'INSUFFICIENT_QUANTITY'
  | 'MOL_NOT_FOUND'
  | 'QUANTITY_OPERATION_REQUIRED'
  | 'MOL_TRANSFER_REQUIRED'
  | 'FULLY_DISPOSED_RESTORE_FORBIDDEN'
  | 'CONCURRENT_UPDATE'

export class AssetServiceError extends ServiceError<AssetServiceErrorCode> {}

const assetInclude = {
  mol: true,
  group: true,
  holdings: {
    where: { quantity: { gt: 0 } },
    include: { mol: true },
    orderBy: { mol: { code: 'asc' as const } },
  },
} satisfies Prisma.AssetInclude

const assetListInclude = {
  ...assetInclude,
  _count: { select: { operations: true } },
} satisfies Prisma.AssetInclude

function snapshot(asset: {
  id: string
  inventoryNumber: string
  name: string
  quantity: Prisma.Decimal
  unitPrice: Prisma.Decimal
  totalCost: Prisma.Decimal
  status: AssetStatus
  isArchived: boolean
}) {
  return {
    id: asset.id,
    inventoryNumber: asset.inventoryNumber,
    name: asset.name,
    quantity: asset.quantity.toString(),
    unitPrice: asset.unitPrice.toString(),
    totalCost: asset.totalCost.toString(),
    status: asset.status,
    isArchived: asset.isArchived,
  }
}

async function serializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const db = getDb()
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034'
      if (!retryable || attempt === 3) {
        if (retryable) throw new AssetServiceError('CONCURRENT_UPDATE')
        throw error
      }
    }
  }
  throw new AssetServiceError('CONCURRENT_UPDATE')
}

export class AssetService {
  static async listOperations(input: OperationsQuery) {
    const db = getDb()
    const where: Prisma.OperationWhereInput = {
      ...(input.assetId ? { assetId: input.assetId } : {}),
      ...(input.type ? { type: input.type } : {}),
    }
    const [operations, total] = await db.$transaction([
      db.operation.findMany({
        where,
        include: {
          asset: { include: { group: true } },
          fromMol: true,
          toMol: true,
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      db.operation.count({ where }),
    ])
    return { operations, total }
  }

  static async list(input: AssetsQuery) {
    const db = getDb()
    const where: Prisma.AssetWhereInput = {
      isArchived: input.archived,
      ...(input.groupId ? { groupId: input.groupId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.accountingForm ? { accountingForm: input.accountingForm } : {}),
      ...(input.dateFrom || input.dateTo
        ? {
            recordingDate: {
              ...(input.dateFrom ? { gte: new Date(`${input.dateFrom}T00:00:00.000Z`) } : {}),
              ...(input.dateTo ? { lte: new Date(`${input.dateTo}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
      ...(input.molId ? { holdings: { some: { molId: input.molId, quantity: { gt: 0 } } } } : {}),
      ...(input.search
        ? {
            OR: [
              { name: { contains: input.search, mode: 'insensitive' } },
              { inventoryNumber: { contains: input.search, mode: 'insensitive' } },
              { documentDetails: { contains: input.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    }
    const [assets, total] = await db.$transaction([
      db.asset.findMany({
        where,
        include: assetListInclude,
        orderBy: { orderNumber: 'asc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      db.asset.count({ where }),
    ])
    return { assets, total }
  }

  static async listCatalogs() {
    const db = getDb()
    const [mols, groups] = await Promise.all([
      db.mol.findMany({ orderBy: { code: 'asc' } }),
      db.assetGroup.findMany({ orderBy: { code: 'asc' } }),
    ])
    return { mols, groups }
  }

  static async get(id: string) {
    return getDb().asset.findUnique({
      where: { id },
      include: {
        ...assetInclude,
        operations: {
          include: { fromMol: true, toMol: true },
          orderBy: { date: 'desc' },
        },
      },
    })
  }

  static async create(input: CreateAssetInput, actorId: string, requestId?: string) {
    const unitPrice = new Prisma.Decimal(input.unitPrice)
    const quantity = new Prisma.Decimal(input.quantity)
    const totalCost = unitPrice.mul(quantity)

    return serializableTransaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          name: input.name,
          inventoryNumber: input.inventoryNumber,
          unitPrice,
          unitOfMeasure: input.unitOfMeasure,
          quantity,
          totalCost,
          molId: input.molId,
          groupId: input.groupId,
          projectId: input.projectId || null,
          contractCode: input.contractCode,
          internalFundingCode: input.internalFundingCode,
          isExistingAsset: input.isExistingAsset,
          recordingDate: new Date(input.recordingDate),
          documentType: input.documentType,
          documentDetails: input.documentDetails,
          documentFiles: input.documentFiles,
          status: input.status,
          notes: input.notes,
          plannedDisposalDate: input.plannedDisposalDate ? new Date(input.plannedDisposalDate) : null,
          plannedDisposalReason: input.plannedDisposalReason,
          photos: input.photos,
          accountingForm: input.accountingForm,
        },
      })

      await Promise.all([
        tx.assetHolding.create({ data: { assetId: asset.id, molId: input.molId, quantity } }),
        tx.operation.create({
          data: {
            type: OperationType.RECEIPT,
            assetId: asset.id,
            toMolId: input.molId,
            quantity,
            unitPrice,
            totalCost,
            date: new Date(input.recordingDate),
            reason: 'Первоначальное поступление',
            documentType: input.documentType,
            documentDetails: input.documentDetails,
            documentFiles: input.documentFiles,
          },
        }),
        tx.auditLog.create({
          data: {
            userId: actorId,
            action: 'ASSET_CREATE',
            entityType: 'Asset',
            entityId: asset.id,
            requestId,
            details: { before: null, after: snapshot(asset) },
          },
        }),
      ])

      return tx.asset.findUniqueOrThrow({ where: { id: asset.id }, include: assetInclude })
    })
  }

  static async update(id: string, input: UpdateAssetInput, actorId: string, requestId?: string) {
    return serializableTransaction(async (tx) => {
      const current = await tx.asset.findUnique({ where: { id } })
      if (!current) throw new AssetServiceError('ASSET_NOT_FOUND')
      if (!current.quantity.equals(input.quantity)) {
        throw new AssetServiceError('QUANTITY_OPERATION_REQUIRED')
      }
      if (current.molId !== input.molId) throw new AssetServiceError('MOL_TRANSFER_REQUIRED')

      const unitPrice = new Prisma.Decimal(input.unitPrice)
      const updated = await tx.asset.update({
        where: { id },
        data: {
          name: input.name,
          inventoryNumber: input.inventoryNumber,
          unitPrice,
          totalCost: unitPrice.mul(current.quantity),
          unitOfMeasure: input.unitOfMeasure,
          groupId: input.groupId,
          projectId: input.projectId || null,
          contractCode: input.contractCode,
          internalFundingCode: input.internalFundingCode,
          isExistingAsset: input.isExistingAsset,
          recordingDate: new Date(input.recordingDate),
          documentType: input.documentType,
          documentDetails: input.documentDetails,
          documentFiles: input.documentFiles,
          status: input.status,
          plannedDisposalDate: input.plannedDisposalDate ? new Date(input.plannedDisposalDate) : null,
          plannedDisposalReason: input.plannedDisposalReason,
          notes: input.notes,
          photos: input.photos,
          accountingForm: input.accountingForm,
        },
      })

      await Promise.all([
        tx.operation.create({
          data: {
            type: OperationType.STATUS_CHANGE,
            assetId: id,
            quantity: updated.quantity,
            unitPrice: updated.unitPrice,
            totalCost: updated.totalCost,
            date: new Date(),
            reason: `Редактирование объекта: ${input.editReason}`,
            documentType: 'Редактирование',
            documentDetails: input.editReason,
            oldStatus: current.status,
            newStatus: updated.status,
          },
        }),
        tx.auditLog.create({
          data: {
            userId: actorId,
            action: 'ASSET_UPDATE',
            entityType: 'Asset',
            entityId: id,
            requestId,
            details: { before: snapshot(current), after: snapshot(updated), reason: input.editReason },
          },
        }),
      ])
      return tx.asset.findUniqueOrThrow({ where: { id }, include: assetInclude })
    })
  }

  static async transfer(id: string, input: TransferAssetInput, actorId: string, requestId?: string) {
    const quantity = new Prisma.Decimal(input.quantity)
    return serializableTransaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { id } })
      if (!asset) throw new AssetServiceError('ASSET_NOT_FOUND')
      if (asset.isArchived) throw new AssetServiceError('ASSET_ARCHIVED')

      const destination = await tx.mol.findUnique({ where: { id: input.toMolId }, select: { id: true } })
      if (!destination) throw new AssetServiceError('MOL_NOT_FOUND')

      const source = await tx.assetHolding.findUnique({
        where: { assetId_molId: { assetId: id, molId: input.fromMolId } },
      })
      if (!source) throw new AssetServiceError('HOLDING_NOT_FOUND')
      if (source.quantity.lt(quantity)) throw new AssetServiceError('INSUFFICIENT_QUANTITY')

      const changed = await tx.assetHolding.updateMany({
        where: { id: source.id, quantity: { gte: quantity } },
        data: { quantity: { decrement: quantity } },
      })
      if (changed.count !== 1) throw new AssetServiceError('CONCURRENT_UPDATE')

      await tx.assetHolding.upsert({
        where: { assetId_molId: { assetId: id, molId: input.toMolId } },
        create: { assetId: id, molId: input.toMolId, quantity },
        update: { quantity: { increment: quantity } },
      })
      await tx.assetHolding.deleteMany({ where: { id: source.id, quantity: 0 } })

      if (asset.molId === input.fromMolId && source.quantity.equals(quantity)) {
        await tx.asset.update({ where: { id }, data: { molId: input.toMolId } })
      }

      const operation = await tx.operation.create({
        data: {
          type: OperationType.TRANSFER,
          assetId: id,
          fromMolId: input.fromMolId,
          toMolId: input.toMolId,
          quantity,
          unitPrice: asset.unitPrice,
          totalCost: asset.unitPrice.mul(quantity),
          date: input.date,
          reason: input.reason,
          documentType: input.documentType,
          documentDetails: input.documentDetails,
          documentFiles: input.documentFiles,
        },
      })
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'ASSET_TRANSFER',
          entityType: 'Asset',
          entityId: id,
          requestId,
          details: {
            operationId: operation.id,
            fromMolId: input.fromMolId,
            toMolId: input.toMolId,
            quantity: quantity.toString(),
          },
        },
      })
      return tx.asset.findUniqueOrThrow({ where: { id }, include: assetInclude })
    })
  }

  static async dispose(id: string, input: DisposeAssetInput, actorId: string, requestId?: string) {
    const quantity = new Prisma.Decimal(input.quantity)
    return serializableTransaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { id } })
      if (!asset) throw new AssetServiceError('ASSET_NOT_FOUND')
      if (asset.isArchived) throw new AssetServiceError('ASSET_ARCHIVED')

      const source = await tx.assetHolding.findUnique({
        where: { assetId_molId: { assetId: id, molId: input.fromMolId } },
      })
      if (!source) throw new AssetServiceError('HOLDING_NOT_FOUND')
      if (source.quantity.lt(quantity)) throw new AssetServiceError('INSUFFICIENT_QUANTITY')

      const changed = await tx.assetHolding.updateMany({
        where: { id: source.id, quantity: { gte: quantity } },
        data: { quantity: { decrement: quantity } },
      })
      if (changed.count !== 1) throw new AssetServiceError('CONCURRENT_UPDATE')
      await tx.assetHolding.deleteMany({ where: { id: source.id, quantity: 0 } })

      const remaining = asset.quantity.minus(quantity)
      const status = remaining.isZero() ? AssetStatus.FULLY_DISPOSED : AssetStatus.PARTIALLY_DISPOSED
      const updated = await tx.asset.update({
        where: { id },
        data: {
          quantity: remaining,
          totalCost: asset.unitPrice.mul(remaining),
          status,
          isArchived: remaining.isZero(),
        },
      })

      if (asset.molId === input.fromMolId && source.quantity.equals(quantity) && !remaining.isZero()) {
        const nextHolding = await tx.assetHolding.findFirst({ where: { assetId: id, quantity: { gt: 0 } } })
        if (nextHolding) await tx.asset.update({ where: { id }, data: { molId: nextHolding.molId } })
      }

      const operation = await tx.operation.create({
        data: {
          type: OperationType.DISPOSAL,
          assetId: id,
          fromMolId: input.fromMolId,
          quantity,
          unitPrice: asset.unitPrice,
          totalCost: asset.unitPrice.mul(quantity),
          date: input.date,
          reason: input.reason,
          documentType: input.documentType,
          documentDetails: input.documentDetails,
          documentFiles: input.documentFiles,
          oldStatus: asset.status,
          newStatus: status,
        },
      })
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'ASSET_DISPOSAL',
          entityType: 'Asset',
          entityId: id,
          requestId,
          details: {
            operationId: operation.id,
            fromMolId: input.fromMolId,
            quantity: quantity.toString(),
            remaining: remaining.toString(),
          },
        },
      })
      return { ...updated, holdings: await tx.assetHolding.findMany({ where: { assetId: id } }) }
    })
  }

  static async archive(id: string, reason: string, actorId: string, requestId?: string) {
    return serializableTransaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { id } })
      if (!asset) throw new AssetServiceError('ASSET_NOT_FOUND')
      if (asset.isArchived) return asset
      const updated = await tx.asset.update({ where: { id }, data: { isArchived: true } })
      await Promise.all([
        tx.operation.create({
          data: {
            type: OperationType.STATUS_CHANGE,
            assetId: id,
            quantity: asset.quantity,
            unitPrice: asset.unitPrice,
            totalCost: asset.totalCost,
            date: new Date(),
            reason,
            documentType: 'Архивирование',
            documentDetails: reason,
            oldStatus: asset.status,
            newStatus: asset.status,
          },
        }),
        tx.auditLog.create({
          data: {
            userId: actorId,
            action: 'ASSET_ARCHIVE',
            entityType: 'Asset',
            entityId: id,
            requestId,
            details: { before: snapshot(asset), after: snapshot(updated), reason },
          },
        }),
      ])
      return updated
    })
  }

  static async restore(id: string, actorId: string, requestId?: string) {
    return serializableTransaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { id } })
      if (!asset) throw new AssetServiceError('ASSET_NOT_FOUND')
      if (asset.status === AssetStatus.FULLY_DISPOSED) {
        throw new AssetServiceError('FULLY_DISPOSED_RESTORE_FORBIDDEN')
      }
      const updated = await tx.asset.update({ where: { id }, data: { isArchived: false } })
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'ASSET_RESTORE',
          entityType: 'Asset',
          entityId: id,
          requestId,
          details: { before: snapshot(asset), after: snapshot(updated) },
        },
      })
      return updated
    })
  }
}
