import type { Employee, StaffSchedule, Vacation, PersonnelAction } from './types'

type ApiNumber = number | string | null
type ApiDate = Date | string

type StaffPositionResponse = Omit<NonNullable<Employee['staffSchedule']>, 'rate' | 'salary' | 'departmentActive'> & {
  rate?: ApiNumber
  salary?: ApiNumber
  departmentRef?: { isActive: boolean } | null
}

export type EmployeeResponse = Omit<Employee, 'phone' | 'email' | 'photo' | 'contractType' | 'contractSignedDate' | 'contractEndDate' | 'employmentRate' | 'staffSchedule'> & {
  phone?: string | null
  email?: string | null
  photo?: string | null
  contractType?: Employee['contractType'] | null
  contractSignedDate?: ApiDate | null
  contractEndDate?: ApiDate | null
  employmentRate?: ApiNumber
  staffSchedule?: StaffPositionResponse | null
}

type StaffScheduleResponse = Omit<StaffSchedule, 'rate' | 'salary' | 'occupiedRate' | 'freeRate' | 'employees' | 'departmentActive'> & {
  rate?: ApiNumber
  salary?: ApiNumber
  occupiedRate?: ApiNumber
  freeRate?: ApiNumber
  employees?: EmployeeResponse[]
  departmentRef?: { isActive: boolean } | null
}

type VacationResponse = Omit<Vacation, 'startDate' | 'endDate'> & { startDate: ApiDate; endDate: ApiDate }
type ActionEmployeeResponse = Omit<PersonnelAction['employee'], 'contractSignedDate' | 'contractEndDate' | 'employmentRate'> & {
  contractSignedDate?: ApiDate | null
  contractEndDate?: ApiDate | null
  employmentRate?: ApiNumber
}
type PersonnelActionResponse = Omit<PersonnelAction, 'date' | 'createdAt' | 'employee' | 'oldContractEndDate' | 'newContractEndDate'> & {
  date: ApiDate
  createdAt: ApiDate
  employee: ActionEmployeeResponse
  oldContractEndDate?: ApiDate | null
  newContractEndDate?: ApiDate | null
}

export const normalizeEmployee = (employee: EmployeeResponse): Employee => ({
  id: employee.id,
  code: employee.code,
  fullName: employee.fullName,
  department: employee.department,
  departmentId: employee.departmentId,
  phone: employee.phone || '',
  email: employee.email || '',
  photo: employee.photo || '',
  contractType: employee.contractType || 'PRIMARY',
  contractSignedDate: employee.contractSignedDate ? new Date(employee.contractSignedDate) : null,
  contractEndDate: employee.contractEndDate ? new Date(employee.contractEndDate) : null,
  contractNumber: employee.contractNumber || '',
  status: employee.status,
  staffScheduleId: employee.staffScheduleId ?? null,
  employmentRate: Number(employee.employmentRate ?? 0),
  staffSchedule: employee.staffSchedule
    ? {
        id: employee.staffSchedule.id,
        position: employee.staffSchedule.position,
        department: employee.staffSchedule.department,
        departmentId: employee.staffSchedule.departmentId,
        departmentActive: employee.staffSchedule.departmentRef?.isActive ?? true,
        rate: Number(employee.staffSchedule.rate || 0),
        salary: Number(employee.staffSchedule.salary || 0),
      }
    : null,
})

export const normalizeStaffSchedule = (position: StaffScheduleResponse): StaffSchedule => {
  const employees = (position.employees || []).map(normalizeEmployee)
  const occupiedRate = Number(
    position.occupiedRate ?? employees.reduce((sum: number, employee: Employee) => sum + employee.employmentRate, 0)
  )

  return {
    id: position.id,
    position: position.position,
    department: position.department,
    departmentId: position.departmentId,
    departmentActive: position.departmentRef?.isActive ?? true,
    rate: Number(position.rate || 0),
    salary: Number(position.salary || 0),
    occupiedRate,
    freeRate: Number(position.freeRate ?? Math.max(Number(position.rate || 0) - occupiedRate, 0)),
    employees,
  }
}

export const normalizeVacation = (vacation: VacationResponse): Vacation => ({
  id: vacation.id,
  employeeId: vacation.employeeId,
  employee: vacation.employee,
  startDate: new Date(vacation.startDate),
  endDate: new Date(vacation.endDate),
  type: vacation.type,
})

export const normalizePersonnelAction = (action: PersonnelActionResponse): PersonnelAction => ({
  id: action.id,
  type: action.type,
  date: new Date(action.date),
  createdAt: new Date(action.createdAt),
  description: action.description || '',
  isSynthetic: Boolean(action.isSynthetic),
  employeeId: action.employeeId,
  employee: {
    ...action.employee,
    contractType: action.employee?.contractType || 'PRIMARY',
    contractSignedDate: action.employee?.contractSignedDate ? new Date(action.employee.contractSignedDate) : null,
    contractEndDate: action.employee?.contractEndDate ? new Date(action.employee.contractEndDate) : null,
    contractNumber: action.employee?.contractNumber || '',
    employmentRate: Number(action.employee?.employmentRate ?? 0),
  },
  oldDepartment: action.oldDepartment ?? null,
  newDepartment: action.newDepartment ?? null,
  oldPosition: action.oldPosition ?? null,
  newPosition: action.newPosition ?? null,
  oldContractEndDate: action.oldContractEndDate ? new Date(action.oldContractEndDate) : null,
  newContractEndDate: action.newContractEndDate ? new Date(action.newContractEndDate) : null,
})
