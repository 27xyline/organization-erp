import { AssetStatus, OperationType, Prisma } from '@prisma/client'
import type { CreateAssetInput } from '../contracts/schemas'
import { serializableTransaction } from '../infrastructure/serializable-transaction'

/**
 * Temporary Stage 07 ownership exception: procurement capitalization still creates its
 * asset through this legacy Prisma transaction until Stage 11 moves that workflow.
 */
export function createTransitionalCapitalizationAsset(
  input: CreateAssetInput,
  actorId: string,
  requestId?: string,
) {
  return serializableTransaction(async (tx) => {
    const unitPrice = new Prisma.Decimal(input.unitPrice)
    const quantity = new Prisma.Decimal(input.quantity)
    const totalCost = unitPrice.mul(quantity)
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

    return tx.asset.findUniqueOrThrow({
      where: { id: asset.id },
      include: {
        mol: true,
        group: true,
        holdings: {
          where: { quantity: { gt: 0 } },
          include: { mol: true },
          orderBy: { mol: { code: 'asc' } },
        },
      },
    })
  })
}

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
