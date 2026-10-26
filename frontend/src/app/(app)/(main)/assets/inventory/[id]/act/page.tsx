import { notFound } from 'next/navigation'
import { AssetInventoryActClient } from '@/features/assets/ui/asset-inventory-act-client'
import { requirePagePermission } from '@/lib/auth/authorization'
import { readAssetInventoryAct } from '@/features/assets/infrastructure/backend-ssr'

export const dynamic = 'force-dynamic'

export default async function AssetInventoryActPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([
    requirePagePermission('assets.inventory.manage'),
    params,
  ])
  const report = await readAssetInventoryAct(user, id)
  if (!report) notFound()
  return <AssetInventoryActClient
    inventory={report.inventory}
    entries={report.entries}
    summary={report.summary}
  />
}
