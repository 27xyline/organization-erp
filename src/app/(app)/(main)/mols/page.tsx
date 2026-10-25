import type { Mol } from '@/features/assets/contracts/types'
import { requirePagePermission } from '@/lib/auth/authorization'
import { MolsClient } from '@/features/assets/ui/mols-client'
import { backendUserFetch } from '@/lib/backend/transport'
import { readBackendData } from '@/lib/backend/page-data'
import type { DepartmentListItem } from '@/features/departments/contracts/types'

export default async function MolsPage() {
  const user = await requirePagePermission('mols.read')
  let molsResponse: Response
  let referencesResponse: Response
  try {
    [molsResponse, referencesResponse] = await Promise.all([
      backendUserFetch('/api/mols', user),
      backendUserFetch('/api/mols/references', user),
    ])
  } catch (cause) {
    throw new Error('Не удалось загрузить МОЛ из backend', { cause })
  }
  const [mols, departments] = await Promise.all([
    readBackendData<Mol[]>(molsResponse, 'Не удалось загрузить МОЛ из backend'),
    readBackendData<{ departments: Array<Pick<DepartmentListItem, 'id' | 'code' | 'name' | 'isActive'>> }>(
      referencesResponse,
      'Не удалось загрузить список подразделений для МОЛ',
    ),
  ])
  const canEdit = user.access.has('mols.create') &&
    user.access.has('mols.update') &&
    user.access.has('mols.delete')

  return (
    <MolsClient
      initialMols={mols}
      departments={departments.departments}
      canEdit={canEdit}
    />
  )
}
