export type EmployeeStatus = 'ACTIVE' | 'ON_VACATION' | 'ON_SICK_LEAVE' | 'DISMISSED'
export type EmploymentContractType = 'PRIMARY' | 'INTERNAL' | 'EXTERNAL'
export type VacationType = 'VACATION' | 'SICK_LEAVE' | 'BUSINESS_TRIP' | 'UNPAID_LEAVE'
export type PersonnelActionType = 'HIRE' | 'DISMISS' | 'TRANSFER' | 'EXTEND' | 'PROMOTE' | 'ARCHIVE' | 'EDIT'

export interface Employee {
  id: string
  code: string
  fullName: string
  department: string
  phone?: string
  email?: string
  photo?: string
  contractType: EmploymentContractType
  contractSignedDate?: Date | null
  contractEndDate?: Date | null
  contractNumber?: string | null
  status: EmployeeStatus
  staffScheduleId?: string | null
  employmentRate: number
  staffSchedule?: {
    id: string
    position: string
    department: string
    rate: number
    salary: number
  } | null
}

export interface StaffSchedule {
  id: string
  position: string
  department: string
  rate: number
  salary: number
  occupiedRate: number
  freeRate: number
  employees: Employee[]
}

export interface Vacation {
  id: string
  employeeId: string
  employee?: { id: string; fullName: string; department?: string }
  startDate: Date
  endDate: Date
  type: VacationType
}

export interface PersonnelAction {
  id: string
  type: PersonnelActionType
  date: Date
  createdAt: Date
  description?: string | null
  isSynthetic?: boolean
  employeeId: string
  employee: {
    id: string
    fullName: string
    department: string
    status: EmployeeStatus
    contractType: EmploymentContractType
    contractSignedDate?: Date | null
    contractEndDate?: Date | null
    contractNumber?: string | null
    staffScheduleId?: string | null
    employmentRate: number
    staffSchedule?: { id: string; position: string; department: string } | null
  }
  oldDepartment?: string | null
  newDepartment?: string | null
  oldPosition?: string | null
  newPosition?: string | null
  oldContractEndDate?: Date | null
  newContractEndDate?: Date | null
}

export const employeeStatusLabels: Record<EmployeeStatus, string> = {
  ACTIVE: 'Работает', ON_VACATION: 'В отпуске', ON_SICK_LEAVE: 'На больничном', DISMISSED: 'Уволен',
}

export const vacationTypeLabels: Record<VacationType, string> = {
  VACATION: 'Отпуск', SICK_LEAVE: 'Больничный', BUSINESS_TRIP: 'Командировка', UNPAID_LEAVE: 'Без содержания',
}

export const employmentContractTypeLabels: Record<EmploymentContractType, string> = {
  PRIMARY: 'Основной', INTERNAL: 'Внутренний', EXTERNAL: 'Внешний',
}

export const personnelActionLabels: Record<PersonnelActionType, string> = {
  HIRE: 'Прием', DISMISS: 'Увольнение', TRANSFER: 'Перевод', EXTEND: 'Продление',
  PROMOTE: 'Повышение', ARCHIVE: 'Архив', EDIT: 'Редактирование',
}
