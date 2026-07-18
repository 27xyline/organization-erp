import { notFound } from 'next/navigation'
import AssetTransferPage from '@/features/assets/ui/asset-transfer-page'
import { requirePagePermission } from '@/lib/auth/authorization'
import { assetTarget } from '@/lib/auth/resource-scopes'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const target = await assetTarget((await params).id)
  if (!target) notFound()
  const user = await requirePagePermission('assets.transfer')
  const allowedDepartmentIds = target.departmentIds?.filter((departmentId) =>
    user.access.allows('assets.transfer', { departmentId })
  ) || []
  if (!allowedDepartmentIds.length) notFound()
  return <AssetTransferPage params={params} allowedDepartmentIds={allowedDepartmentIds} />
}
