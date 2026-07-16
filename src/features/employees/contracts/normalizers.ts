import type { Employee, StaffSchedule, Vacation, PersonnelAction } from './types'

export const normalizeEmployee = (employee: any): Employee => ({
  id: employee.id,
  code: employee.code,
  fullName: employee.fullName,
  department: employee.department,
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
        rate: Number(employee.staffSchedule.rate || 0),
        salary: Number(employee.staffSchedule.salary || 0),
      }
    : null,
})

export const normalizeStaffSchedule = (position: any): StaffSchedule => {
  const employees = (position.employees || []).map(normalizeEmployee)
  const occupiedRate = Number(
    position.occupiedRate ?? employees.reduce((sum: number, employee: Employee) => sum + employee.employmentRate, 0)
  )

  return {
    id: position.id,
    position: position.position,
    department: position.department,
    rate: Number(position.rate || 0),
    salary: Number(position.salary || 0),
    occupiedRate,
    freeRate: Number(position.freeRate ?? Math.max(Number(position.rate || 0) - occupiedRate, 0)),
    employees,
  }
}

export const normalizeVacation = (vacation: any): Vacation => ({
  id: vacation.id,
  employeeId: vacation.employeeId,
  employee: vacation.employee,
  startDate: new Date(vacation.startDate),
  endDate: new Date(vacation.endDate),
  type: vacation.type,
})

export const normalizePersonnelAction = (action: any): PersonnelAction => ({
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
