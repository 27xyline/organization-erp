import { EmployeeReadService } from '@/features/employees/application/employee-read.service'
import { requirePagePermission } from '@/lib/auth/authorization'
import { EmployeesClient } from '@/features/employees/ui/employees-client'

export default async function EmployeesPage() {
  const user = await requirePagePermission('employees.read')
  const initialData = await EmployeeReadService.dashboard(new Date().getFullYear(), user.access)
  const canEdit = user.access.has('employees.create') ||
    user.access.has('employees.update') ||
    user.access.has('staffSchedule.update') ||
    user.access.has('vacations.update') ||
    user.access.has('personnelActions.create')

  return <EmployeesClient initialData={initialData} canEdit={canEdit} />
}
