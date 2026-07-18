import type { DashboardQuery } from './dashboard'

export interface DashboardOverview {
  query: DashboardQuery
  options: {
    departments: Array<{ id: string; code: string; name: string }>
    projects: Array<{ id: string; code: string; name: string }>
  }
  visibility: {
    employees: boolean
    projects: boolean
    finance: boolean
    assets: boolean
    audit: boolean
  }
  summary: {
    headcount: number
    active: number
    occupiedRate: number
    staffRate: number
    plannedFot: number
    actualFot: number
    occupancy: number
    count: number
    plannedBudget: number
    actualBudget: number
    variance: number
    budgetUsage: number
    averageProgress: number
    assetCount: number
    assetValue: number
    awayNow: number
    overdueTasks: number
    assetAttention: number
    contractsExpiring: number
  }
  activeProjects: Array<{
    id: string
    code: string
    name: string
    startDate: Date | null
    endDate: Date | null
    plannedBudget: number
    actualBudget: number
    progress: number
    tasksTotal: number
    tasksCompleted: number
  }>
  currentAbsences: Array<{
    id: string
    employeeId: string
    employee: string
    department: string
    type: string
    startDate: Date
    endDate: Date
  }>
  contracts: Array<{
    id: string
    code: string
    employee: string
    department: string
    position: string
    contractEndDate: Date
    daysLeft: number
  }>
  overdueTasks: Array<{
    id: string
    name: string
    project: { id: string; code: string; name: string }
    progress: number
    priority: string
    endDate: Date
    responsible: string
    overdueDays: number
  }>
  assetAttention: Array<{
    id: string
    name: string
    inventoryNumber: string
    status: string
    totalCost: number
    plannedDisposalDate: Date | null
    mol: { department: string }
  }>
  recentActivity: Array<{
    id: string
    kind: 'ASSET' | 'EMPLOYEE' | 'AUDIT'
    title: string
    description: string
    date: Date
    href: string | null
  }>
  analytics: {
    workforceByDepartment: Array<{
      departmentId: string
      department: string
      headcount: number
      active: number
      occupiedRate: number
      staffRate: number
      plannedFot: number
      actualFot: number
      occupancy: number
    }>
    projects: DashboardOverview['activeProjects']
    assetsByStatus: Array<{ status: string; count: number; value: number }>
    vacationsByType: Array<{ type: string; count: number }>
    vacations: Array<{
      id: string
      employeeId: string
      employee: string
      department: string
      type: string
      startDate: Date
      endDate: Date
    }>
  }
}

