import { EmployeeReadService } from '@/features/employees/application/employee-read.service'
import { requirePageUser } from '@/lib/auth/authorization'
import { EmployeesClient } from '@/features/employees/ui/employees-client'

export default async function EmployeesPage() {
  const [user, initialData] = await Promise.all([
    requirePageUser(),
    EmployeeReadService.dashboard(new Date().getFullYear()),
  ])
  return <EmployeesClient initialData={initialData} canEdit={user.role !== 'VIEWER'} />
}
