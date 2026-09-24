import { DashboardService } from '@/features/reporting/application/dashboard.service'
import { parseDashboardQuery } from '@/features/reporting/contracts/dashboard'
import { ReportsPage } from '@/features/reporting/ui/reports-page'
import { requirePagePermission } from '@/lib/auth/authorization'
import type { ReportMetric } from '@/features/reporting/contracts/report-presets'

export const dynamic = 'force-dynamic'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [user, rawQuery] = await Promise.all([
    requirePagePermission('reports.read'),
    searchParams,
  ])
  const data = await DashboardService.getOverview(parseDashboardQuery(rawQuery), user.access)
  const availableCustomMetrics: ReportMetric[] = [
    ...(user.access.has('employees.read') ? ['headcount', 'occupiedRate'] as const : []),
    ...(user.access.has('finance.salary.read') ? ['plannedFot', 'actualFot'] as const : []),
    ...(user.access.has('assets.read') ? ['assetValue'] as const : []),
    ...(user.access.has('projects.read') ? ['projectBudget'] as const : []),
  ]
  const canGroupByDepartment = user.access.has('departments.read')
  const canGroupByProject = user.access.has('projects.read')
  const defaultCustomGroupBy = canGroupByDepartment &&
    availableCustomMetrics.some((metric) => ['headcount', 'occupiedRate', 'plannedFot', 'assetValue'].includes(metric))
    ? 'department'
    : 'project'

  return (
    <ReportsPage
      data={data}
      canExport={user.access.has('reports.export')}
      canReadTurnover={user.access.has('employees.read') && user.access.has('personnelActions.read')}
      canReadProfitability={user.access.has('projects.read') && user.access.has('projectPayroll.read') && user.access.has('finance.salary.read')}
      canReadDepreciation={user.access.has('assets.read')}
      canReadVacations={user.access.has('vacations.read')}
      canGroupByDepartment={canGroupByDepartment}
      canGroupByProject={canGroupByProject}
      availableCustomMetrics={availableCustomMetrics}
      defaultCustomGroupBy={defaultCustomGroupBy}
    />
  )
}
