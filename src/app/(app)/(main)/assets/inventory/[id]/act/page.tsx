import { notFound } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { AssetInventoryActClient } from '@/features/assets/ui/asset-inventory-act-client'
import { getAssetInventoryService } from '@/features/assets/application/inventory.service'
import { AssetInventoryError } from '@/features/assets/domain/asset-inventory-error'
import { requirePagePermission } from '@/lib/auth/authorization'

export const dynamic = 'force-dynamic'

export default async function AssetInventoryActPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([
    requirePagePermission('assets.inventory.manage'),
    params,
  ])
  let report
  try {
    report = await getAssetInventoryService().getAct(id, user.access)
  } catch (error) {
    if (error instanceof AssetInventoryError && error.code === 'INVENTORY_NOT_FOUND') notFound()
    throw error
  }
  return <AssetInventoryActClient
    inventory={{
      ...report.inventory,
      createdAt: report.inventory.createdAt.toISOString(),
      completedAt: report.inventory.completedAt?.toISOString() ?? null,
    }}
    entries={report.entries.map((entry) => ({
      id: entry.id,
      inventoryNumber: entry.inventoryNumber,
      assetName: entry.assetName,
      unitOfMeasure: entry.unitOfMeasure,
      expectedQuantity: entry.expectedQuantity.toString(),
      foundQuantity: entry.foundQuantity?.toString() ?? null,
      differenceQuantity: entry.foundQuantity === null
        ? null
        : new Prisma.Decimal(entry.foundQuantity).sub(entry.expectedQuantity).toFixed(2),
      note: entry.note,
    }))}
    summary={report.summary}
  />
}
