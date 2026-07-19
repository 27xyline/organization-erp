export interface WorkforceInput {
  departmentId: string
  department: string
  active: boolean
  employmentRate: number
  monthlySalary: number
}

export interface StaffCapacityInput {
  departmentId: string
  rate: number
}

export interface SalaryInput {
  departmentId: string
  amount: number
}

export interface ProjectInput {
  plannedBudget: number
  actualBudget: number
  progress: number
}

export interface AssetInput {
  status: string
  totalCost: number
}

export function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0
}

export function monthsInPeriod(dateFrom: Date, dateTo: Date) {
  return Math.max(
    1,
    (dateTo.getUTCFullYear() - dateFrom.getUTCFullYear()) * 12
      + dateTo.getUTCMonth() - dateFrom.getUTCMonth() + 1,
  )
}

export function aggregateWorkforce(
  employees: WorkforceInput[],
  staff: StaffCapacityInput[],
  salaries: SalaryInput[],
  months: number,
) {
  const departments = new Map<string, {
    departmentId: string
    department: string
    headcount: number
    active: number
    occupiedRate: number
    staffRate: number
    plannedFot: number
    actualFot: number
  }>()

  for (const employee of employees) {
    const row = departments.get(employee.departmentId) || {
      departmentId: employee.departmentId,
      department: employee.department,
      headcount: 0,
      active: 0,
      occupiedRate: 0,
      staffRate: 0,
      plannedFot: 0,
      actualFot: 0,
    }
    row.headcount += 1
    if (employee.active) row.active += 1
    row.occupiedRate += employee.employmentRate
    row.plannedFot += employee.monthlySalary * months
    departments.set(employee.departmentId, row)
  }

  for (const position of staff) {
    const row = departments.get(position.departmentId)
    if (row) row.staffRate += position.rate
  }
  for (const salary of salaries) {
    const row = departments.get(salary.departmentId)
    if (row) row.actualFot += salary.amount
  }

  const rows = [...departments.values()]
    .map((row) => ({ ...row, occupancy: percent(row.occupiedRate, row.staffRate) }))
    .sort((left, right) => left.department.localeCompare(right.department, 'ru'))
  return {
    rows,
    totals: rows.reduce((total, row) => ({
      headcount: total.headcount + row.headcount,
      active: total.active + row.active,
      occupiedRate: total.occupiedRate + row.occupiedRate,
      staffRate: total.staffRate + row.staffRate,
      plannedFot: total.plannedFot + row.plannedFot,
      actualFot: total.actualFot + row.actualFot,
    }), {
      headcount: 0,
      active: 0,
      occupiedRate: 0,
      staffRate: 0,
      plannedFot: 0,
      actualFot: 0,
    }),
  }
}

export function aggregateProjects(projects: ProjectInput[]) {
  const totals = projects.reduce((total, project) => ({
    plannedBudget: total.plannedBudget + project.plannedBudget,
    actualBudget: total.actualBudget + project.actualBudget,
    progress: total.progress + project.progress,
  }), { plannedBudget: 0, actualBudget: 0, progress: 0 })
  return {
    count: projects.length,
    plannedBudget: totals.plannedBudget,
    actualBudget: totals.actualBudget,
    variance: totals.actualBudget - totals.plannedBudget,
    budgetUsage: percent(totals.actualBudget, totals.plannedBudget),
    averageProgress: projects.length ? Math.round(totals.progress / projects.length) : 0,
  }
}

export function aggregateAssets(assets: AssetInput[]) {
  const byStatus = new Map<string, { status: string; count: number; value: number }>()
  let value = 0
  for (const asset of assets) {
    value += asset.totalCost
    const row = byStatus.get(asset.status) || { status: asset.status, count: 0, value: 0 }
    row.count += 1
    row.value += asset.totalCost
    byStatus.set(asset.status, row)
  }
  return {
    count: assets.length,
    value,
    byStatus: [...byStatus.values()].sort((left, right) => right.value - left.value),
  }
}

export function aggregateVacations(types: string[]) {
  const groups = new Map<string, number>()
  for (const type of types) groups.set(type, (groups.get(type) || 0) + 1)
  return [...groups.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => right.count - left.count)
}

