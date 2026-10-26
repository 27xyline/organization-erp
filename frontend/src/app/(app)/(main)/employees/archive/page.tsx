import EmployeeArchivePage from '@/features/employees/ui/employee-archive-page'
import { requirePagePermission } from '@/lib/auth/authorization'

export default async function Page() {
  const user = await requirePagePermission('employees.read')
  return (
    <EmployeeArchivePage
      canEdit={user.access.has('personnelActions.create') && user.access.has('employees.update')}
    />
  )
}
