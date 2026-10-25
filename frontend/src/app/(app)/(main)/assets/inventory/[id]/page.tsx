import { AssetInventoryDetailClient } from '@/features/assets/ui/asset-inventory-detail-client'
import { requirePagePermission } from '@/lib/auth/authorization'

export const dynamic = 'force-dynamic'

export default async function AssetInventoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission('assets.inventory.manage')
  const { id } = await params
  return <AssetInventoryDetailClient inventoryId={id} />
}
