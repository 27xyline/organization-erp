import { FinanceMonthCell, FinancePlanRow } from '@/features/finance/contracts/ui-types'

export interface ProjectMemberOption {
  id: string
  code: string
  fullName: string
  department: string
  position: string
  rate: string
  salary: string
}

export interface ProjectMemberRow {
  id: string
  projectId: string
  employeeId: string
  department: string
  position: string
  rate: string
  salary: string
  isArchived: boolean
  archivedAt: string | Date | null
  createdAt: string | Date
  updatedAt: string | Date
  employee: {
    id: string
    code: string
    fullName: string
    department: string
    employmentRate: string
    status: string
    staffSchedule: {
      id: string
      position: string
      department: string
      salary: string
    } | null
  }
}

export interface ProjectPayrollCell extends FinanceMonthCell {
  details: Array<{
    type: 'OKLAD' | 'NADBAVKA'
    typeLabel: string
    projectCode: string
    amount: string
  }>
}

export interface ProjectPayrollRow extends FinancePlanRow {
  months: Record<string, ProjectPayrollCell>
}

export interface ProjectPayrollSelectedCell {
  employeeId: string
  employeeName: string
  employeeSalary: string
  month: number
  cell: ProjectPayrollCell
}
