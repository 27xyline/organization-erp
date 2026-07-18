import {
  AssetMaintenanceStatus,
  AssetMaintenanceType,
  AssetStatus,
  OperationType,
  Prisma,
} from '@prisma/client'
import { getDb } from '@/lib/prisma'
import type {
  CreateMaintenanceInput,
  UpdateMaintenanceInput,
} from '../contracts/maintenance'
import {
  ensureMaintenanceTransition,
  MaintenanceTransitionError,
} from '../domain/maintenance-rules'

export type AssetLifecycleErrorCode =
  | 'ASSET_NOT_FOUND'
  | 'MAINTENANCE_NOT_FOUND'
  | 'ASSET_UNAVAILABLE'
  | 'INVALID_TRANSITION'

export class AssetLifecycleError extends Error {
  constructor(readonly code: AssetLifecycleErrorCode) {
    super(code)
  }
}

function restoredStatus(value: AssetStatus | null) {
  if (!value || value === AssetStatus.UNDER_REPAIR) return AssetStatus.IN_USE
  return value
}

export class AssetLifecycleService {
  static list(assetId: string) {
    return getDb().assetMaintenance.findMany({
      where: { assetId },
      orderBy: [{ scheduledDate: 'desc' }, { createdAt: 'desc' }],
    })
  }

  static async create(
    assetId: string,
    input: CreateMaintenanceInput,
    actorId: string,
    requestId?: string,
  ) {
    const db = getDb()
    const asset = await db.asset.findUnique({
      where: { id: assetId },
      select: { id: true, isArchived: true, status: true },
    })
    if (!asset) throw new AssetLifecycleError('ASSET_NOT_FOUND')
    if (asset.isArchived || asset.status === AssetStatus.FULLY_DISPOSED) {
      throw new AssetLifecycleError('ASSET_UNAVAILABLE')
    }
    return db.$transaction(async (tx) => {
      const record = await tx.assetMaintenance.create({
        data: {
          assetId,
          type: input.type,
          title: input.title,
          description: input.description || null,
          scheduledDate: input.scheduledDate,
          nextDueDate: input.nextDueDate || null,
          provider: input.provider || null,
          cost: new Prisma.Decimal(input.cost),
        },
      })
      await tx.auditLog.create({
        data: {
          userId: actorId,
          requestId,
          action: 'ASSET_MAINTENANCE_CREATE',
          entityType: 'AssetMaintenance',
          entityId: record.id,
          details: { assetId, type: record.type, scheduledDate: record.scheduledDate },
        },
      })
      return record
    })
  }

  static async update(
    assetId: string,
    id: string,
    input: UpdateMaintenanceInput,
    actorId: string,
    requestId?: string,
  ) {
    const db = getDb()
    const current = await db.assetMaintenance.findFirst({
      where: { id, assetId },
      include: { asset: true },
    })
    if (!current) throw new AssetLifecycleError('MAINTENANCE_NOT_FOUND')
    const nextStatus = input.status || current.status
    try {
      ensureMaintenanceTransition(current.status, nextStatus)
    } catch (error) {
      if (error instanceof MaintenanceTransitionError) {
        throw new AssetLifecycleError('INVALID_TRANSITION')
      }
      throw error
    }

    return db.$transaction(async (tx) => {
      let nextAssetStatus: AssetStatus | null = null
      let assetStatusBefore = current.assetStatusBefore
      if (
        current.type === AssetMaintenanceType.REPAIR &&
        current.status !== AssetMaintenanceStatus.IN_PROGRESS &&
        nextStatus === AssetMaintenanceStatus.IN_PROGRESS
      ) {
        assetStatusBefore = current.asset.status
        nextAssetStatus = AssetStatus.UNDER_REPAIR
      }
      if (
        current.type === AssetMaintenanceType.REPAIR &&
        current.status === AssetMaintenanceStatus.IN_PROGRESS &&
        (nextStatus === AssetMaintenanceStatus.COMPLETED ||
          nextStatus === AssetMaintenanceStatus.CANCELED)
      ) {
        nextAssetStatus = restoredStatus(current.assetStatusBefore)
      }

      const record = await tx.assetMaintenance.update({
        where: { id },
        data: {
          ...input,
          status: nextStatus,
          description: input.description === undefined ? undefined : input.description || null,
          provider: input.provider === undefined ? undefined : input.provider || null,
          result: input.result === undefined ? undefined : input.result || null,
          nextDueDate: input.nextDueDate === undefined ? undefined : input.nextDueDate,
          cost: input.cost === undefined ? undefined : new Prisma.Decimal(input.cost),
          startedAt: nextStatus === AssetMaintenanceStatus.IN_PROGRESS
            ? input.startedAt || current.startedAt || new Date()
            : input.startedAt,
          completedAt: nextStatus === AssetMaintenanceStatus.COMPLETED
            ? input.completedAt || current.completedAt || new Date()
            : input.completedAt,
          assetStatusBefore,
        },
      })

      if (nextAssetStatus && current.asset.status !== nextAssetStatus) {
        await Promise.all([
          tx.asset.update({ where: { id: assetId }, data: { status: nextAssetStatus } }),
          tx.operation.create({
            data: {
              type: OperationType.STATUS_CHANGE,
              assetId,
              quantity: current.asset.quantity,
              unitPrice: current.asset.unitPrice,
              totalCost: current.asset.totalCost,
              date: new Date(),
              reason: record.title,
              documentType: 'Обслуживание имущества',
              documentDetails: record.result || record.description || record.title,
              oldStatus: current.asset.status,
              newStatus: nextAssetStatus,
            },
          }),
        ])
      }

      await tx.auditLog.create({
        data: {
          userId: actorId,
          requestId,
          action: 'ASSET_MAINTENANCE_UPDATE',
          entityType: 'AssetMaintenance',
          entityId: id,
          details: {
            assetId,
            beforeStatus: current.status,
            afterStatus: record.status,
            cost: record.cost,
          },
        },
      })
      return record
    })
  }
}
