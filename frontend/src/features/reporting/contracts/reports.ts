import type { ReportMetric, ReportPresetInput } from './report-presets'

export interface TurnoverReport {
  activeAtStart: number
  activeAtEnd: number
  hiredCount: number
  dismissedCount: number
  turnoverRate: number
}

export interface ProfitabilityRow {
  id: string
  code: string
  name: string
  plannedRevenue: number
  actualRevenue: number
  payrollCost: number
  procurementCost: number
  totalCost: number
  profit: number
  profitabilityRate: number
}

export interface DepreciationReport {
  assets: Array<{
    id: string
    inventoryNumber: string
    name: string
    initialCost: number
    depreciation: number
    residualValue: number
    mol: string
    department: string
  }>
  movements: Array<{
    id: string
    date: string
    type: string
    assetName: string
    inventoryNumber: string
    fromMol: string
    toMol: string
    quantity: number
    reason: string
  }>
}

export interface VacationReportRow {
  id: string
  employeeName: string
  department: string
  type: string
  startDate: string
  endDate: string
  durationDays: number
}

export interface ReportPreset extends Omit<ReportPresetInput, 'metrics'> {
  id: string
  metrics: ReportMetric[]
}

export interface CustomReportRow {
  groupKey: string
  groupName: string
  headcount?: number
  occupiedRate?: number
  plannedFot?: number
  plannedBudget?: number
  actualBudget?: number
  actualFot?: number
  assetValue?: number
}
