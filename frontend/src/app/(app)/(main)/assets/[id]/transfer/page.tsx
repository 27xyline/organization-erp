import { notFound } from 'next/navigation'
import AssetTransferPage from '@/features/assets/ui/asset-transfer-page'
import { requirePagePermission } from '@/lib/auth/authorization'
import { readAssetById } from '@/features/assets/infrastructure/backend-ssr'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePagePermission('assets.transfer')
  const asset = await readAssetById(user, id)
  if (!asset) notFound()
  const departmentIds = Array.from(new Set([
    asset.mol.departmentId,
    ...asset.holdings.map((holding) => holding.mol.departmentId),
  ]))
  const allowedDepartmentIds = departmentIds.filter((departmentId) =>
    user.access.allows('assets.transfer', { departmentId })
  )
  if (!allowedDepartmentIds.length) notFound()
  return <AssetTransferPage params={params} allowedDepartmentIds={allowedDepartmentIds} />
}
