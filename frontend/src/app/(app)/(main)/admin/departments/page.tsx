import type { DepartmentHeadCandidate, DepartmentListItem } from '@/features/departments/contracts/types'
import { DepartmentsClient } from '@/features/departments/ui/departments-client'
import { requirePagePermission } from '@/lib/auth/authorization'
import { backendUserFetch } from '@/lib/backend/transport'
import { readBackendData } from '@/lib/backend/page-data'

export default async function DepartmentsPage() {
  const user = await requirePagePermission({
    allOf: [
      'departments.read',
      'departments.create',
      'departments.update',
      'departments.delete',
    ],
  })
  let listResponse: Response
  let referencesResponse: Response
  try {
    [listResponse, referencesResponse] = await Promise.all([
      backendUserFetch('/api/departments', user),
      backendUserFetch('/api/departments/references', user),
    ])
  } catch (cause) {
    throw new Error('Не удалось загрузить подразделения из backend', { cause })
  }
  const [departments, references] = await Promise.all([
    readBackendData<DepartmentListItem[]>(listResponse, 'Не удалось загрузить подразделения из backend'),
    readBackendData<{ headCandidates: DepartmentHeadCandidate[] }>(
      referencesResponse,
      'Не удалось загрузить справочники подразделений из backend',
    ),
  ])

  return (
    <DepartmentsClient
      initialDepartments={departments}
      headCandidates={references.headCandidates}
    />
  )
}
