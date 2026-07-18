import { CatalogService } from '@/features/assets/application/catalog.service'
import { requirePagePermission } from '@/lib/auth/authorization'
import { GroupsClient } from '@/features/assets/ui/groups-client'

export default async function GroupsPage() {
  const [user, groups] = await Promise.all([
    requirePagePermission('assetGroups.read'),
    CatalogService.listGroups(),
  ])
  const canEdit = user.access.has('assetGroups.create') &&
    user.access.has('assetGroups.update') &&
    user.access.has('assetGroups.delete')
  return <GroupsClient initialGroups={groups} canEdit={canEdit} />
}
