import { parseDashboardQuery } from '@/features/reporting/contracts/dashboard'
import { ReportsPage } from '@/features/reporting/ui/reports-page'
import { requirePagePermission } from '@/lib/auth/authorization'
import type { ReportMetric } from '@/features/reporting/contracts/report-presets'
import { backendUserFetch } from '@/lib/backend/bridge'
import { readBackendData } from '@/lib/backend/page-data'
import type { DashboardOverview } from '@/features/reporting/contracts/view-model'

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
  const query = parseDashboardQuery(rawQuery)
  const response = await backendUserFetch(`/api/dashboard?${new URLSearchParams(query).toString()}`, user)
  const rawData = await readBackendData<DashboardOverview>(response, 'Не удалось загрузить отчётную сводку из backend')
  const data = {
    ...rawData,
    activeProjects: rawData.activeProjects.map((item) => ({ ...item, startDate: item.startDate ? new Date(item.startDate) : null, endDate: item.endDate ? new Date(item.endDate) : null })),
    currentAbsences: rawData.currentAbsences.map((item) => ({ ...item, startDate: new Date(item.startDate), endDate: new Date(item.endDate) })),
    contracts: rawData.contracts.map((item) => ({ ...item, contractEndDate: new Date(item.contractEndDate) })),
    overdueTasks: rawData.overdueTasks.map((item) => ({ ...item, endDate: new Date(item.endDate) })),
    recentActivity: rawData.recentActivity.map((item) => ({ ...item, date: new Date(item.date) })),
    analytics: {
      ...rawData.analytics,
      projects: rawData.analytics.projects.map((item) => ({ ...item, startDate: item.startDate ? new Date(item.startDate) : null, endDate: item.endDate ? new Date(item.endDate) : null })),
      vacations: rawData.analytics.vacations.map((item) => ({ ...item, startDate: new Date(item.startDate), endDate: new Date(item.endDate) })),
    },
  }
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
