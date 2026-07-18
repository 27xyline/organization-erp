import { notFound } from 'next/navigation'
import { requirePagePermission } from '@/lib/auth/authorization'
import { EmployeeProfileService } from '@/features/employees/application/employee-profile.service'
import { EmployeeProfileClient } from '@/features/employees/ui/employee-profile-client'

export const dynamic = 'force-dynamic'

export default async function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requirePagePermission('employees.read')
  const profile = await EmployeeProfileService.get((await params).id, user.access)
  if (!profile) notFound()

  return (
    <EmployeeProfileClient
      initialData={profile}
      canEdit={user.access.has('employees.update')}
    />
  )
}
