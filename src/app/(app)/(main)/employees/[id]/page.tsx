import { notFound } from 'next/navigation'
import { requirePagePermission } from '@/lib/auth/authorization'
import { EmployeeProfileClient } from '@/features/employees/ui/employee-profile-client'
import { backendUserFetch } from '@/lib/backend/bridge'
import { readBackendData } from '@/lib/backend/page-data'

type EmployeeProfileData = Parameters<typeof EmployeeProfileClient>[0]['initialData']

export const dynamic = 'force-dynamic'

export default async function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requirePagePermission('employees.read')
  const { id } = await params
  let response: Response
  try {
    response = await backendUserFetch(`/api/employees/${encodeURIComponent(id)}/profile`, user)
  } catch (cause) {
    throw new Error('Не удалось загрузить карточку сотрудника из backend', { cause })
  }
  const profile = await readBackendData<EmployeeProfileData | null>(
    response,
    'Не удалось загрузить карточку сотрудника из backend',
  )
  if (!profile) notFound()

  return (
    <EmployeeProfileClient
      initialData={profile}
      canEdit={user.access.has('employees.update')}
    />
  )
}
