import { AssetInventoryScanClient } from '@/features/assets/ui/asset-inventory-scan-client'
import { requirePagePermission } from '@/lib/auth/authorization'

export const dynamic = 'force-dynamic'

export default async function AssetInventoryScanPage({
  searchParams,
}: {
  searchParams: Promise<{ number?: string | string[] }>
}) {
  await requirePagePermission('assets.inventory.manage')
  const params = await searchParams
  const number = Array.isArray(params.number) ? params.number[0] : params.number
  return <AssetInventoryScanClient inventoryNumber={number || ''} />
}
