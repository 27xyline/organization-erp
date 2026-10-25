import { AssetInventoryListClient } from '@/features/assets/ui/asset-inventory-list-client'
import { requirePagePermission } from '@/lib/auth/authorization'

export const dynamic = 'force-dynamic'

export default async function AssetInventoryPage() {
  await requirePagePermission('assets.inventory.manage')
  return <AssetInventoryListClient />
}
