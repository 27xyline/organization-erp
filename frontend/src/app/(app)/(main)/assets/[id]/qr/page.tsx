import { notFound } from 'next/navigation'
import { AssetQrLabelClient } from '@/features/assets/ui/asset-qr-label-client'
import { requirePagePermission } from '@/lib/auth/authorization'
import { readAssetById } from '@/features/assets/infrastructure/backend-ssr'

export const dynamic = 'force-dynamic'

export default async function AssetQrLabelPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([
    requirePagePermission('assets.read'),
    params,
  ])
  const asset = await readAssetById(user, id)
  if (!asset) notFound()

  return <AssetQrLabelClient asset={{
    id: asset.id,
    name: asset.name,
    inventoryNumber: asset.inventoryNumber,
    unitOfMeasure: asset.unitOfMeasure,
    molName: asset.mol.fullName,
    storageLocation: asset.mol.storageLocation,
  }} />
}
