import { EmployeesClient } from '@/features/employees/ui/employees-client'
import { requirePagePermission } from '@/lib/auth/authorization'
import { backendUserFetch } from '@/lib/backend/transport'
import { readBackendData } from '@/lib/backend/page-data'
import {
  normalizeEmployee,
  normalizePersonnelAction,
  normalizeStaffSchedule,
  normalizeVacation,
} from '@/features/employees/contracts/normalizers'

type EmployeesInitialData = Parameters<typeof EmployeesClient>[0]['initialData']
type EmployeesDashboardResponse = Omit<EmployeesInitialData, 'employees' | 'staffSchedule' | 'vacations' | 'personnelActions'> & {
  employees: Parameters<typeof normalizeEmployee>[0][]
  staffSchedule: Parameters<typeof normalizeStaffSchedule>[0][]
  vacations: Parameters<typeof normalizeVacation>[0][]
  personnelActions: Parameters<typeof normalizePersonnelAction>[0][]
}

export default async function EmployeesPage() {
  const user = await requirePagePermission('employees.read')
  const year = new Date().getFullYear()
  let response: Response
  try {
    response = await backendUserFetch(`/api/employees/dashboard?year=${year}`, user)
  } catch (cause) {
    throw new Error('Не удалось загрузить кадровую сводку из backend', { cause })
  }
  const result = await readBackendData<EmployeesDashboardResponse>(
    response,
    'Не удалось загрузить кадровую сводку из backend',
  )
  const initialData: EmployeesInitialData = {
    employees: result.employees.map(normalizeEmployee),
    staffSchedule: result.staffSchedule.map(normalizeStaffSchedule),
    departments: result.departments,
    vacations: result.vacations.map(normalizeVacation),
    personnelActions: result.personnelActions.map(normalizePersonnelAction),
  }
  const canEdit = user.access.has('employees.create') ||
    user.access.has('employees.update') ||
    user.access.has('staffSchedule.update') ||
    user.access.has('vacations.update') ||
    user.access.has('personnelActions.create')

  return <EmployeesClient initialData={initialData} canEdit={canEdit} />
}
