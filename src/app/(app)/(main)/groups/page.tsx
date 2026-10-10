import type { AssetGroup } from '@/features/assets/contracts/types'
import { requirePagePermission } from '@/lib/auth/authorization'
import { GroupsClient } from '@/features/assets/ui/groups-client'
import { backendUserFetch } from '@/lib/backend/bridge'
import { readBackendData } from '@/lib/backend/page-data'

export default async function GroupsPage() {
  const user = await requirePagePermission('assetGroups.read')
  let groupsResponse: Response
  try {
    groupsResponse = await backendUserFetch('/api/groups', user)
  } catch (cause) {
    throw new Error('Не удалось загрузить группы имущества из backend', { cause })
  }
  const groups = await readBackendData<AssetGroup[]>(
    groupsResponse,
    'Не удалось загрузить группы имущества из backend',
  )
  const canEdit = user.access.has('assetGroups.create') &&
    user.access.has('assetGroups.update') &&
    user.access.has('assetGroups.delete')
  return <GroupsClient initialGroups={groups} canEdit={canEdit} />
}
