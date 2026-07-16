export interface FinanceMonthCell {
  amount: string
  projectId: string | null
  projectCode: string
  projectName: string
  projectLabel?: string
  allocations?: Array<{
    projectId: string
    projectCode: string
    projectName: string
    amount: string
  }>
  details?: Array<{
    typeLabel: string
    projectCode: string
    amount: string
  }>
}

export interface FinancePlanRow {
  employeeId: string
  fullName: string
  department: string
  position: string
  rate: string
  salary: string
  months: Record<string, FinanceMonthCell>
}

export interface FinanceProjectOption {
  id: string
  code: string
  name: string
  plannedBudget: string
  actualBudget: string
  remainingBudget: string
}

export interface FinanceAllocationRow {
  localId: string
  projectId: string
  amount: string
}

export interface FinanceSelectedCell {
  employeeId: string
  employeeName: string
  employeeSalary: string
  month: number
  cell: FinanceMonthCell
}

export interface SalaryDetailGroup {
  typeLabel: string
  total: number
  items: Array<{
    projectCode: string
    amount: string
  }>
}

export type FinanceSectionType = 'salary' | 'oklad' | 'nadbavka'
