import { CatalogService } from '@/features/assets/application/catalog.service'
import { requirePageUser } from '@/lib/auth/authorization'
import { GroupsClient } from './groups-client'

export default async function GroupsPage() {
  const [user, groups] = await Promise.all([requirePageUser(), CatalogService.listGroups()])
  return <GroupsClient initialGroups={groups} canEdit={user.role !== 'VIEWER'} />
}
