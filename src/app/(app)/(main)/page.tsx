import { parseDashboardQuery } from '@/features/reporting/contracts/dashboard'
import { DashboardPage } from '@/features/reporting/ui/dashboard-page'
import { requirePagePermission } from '@/lib/auth/authorization'
import { backendUserFetch } from '@/lib/backend/bridge'
import { readBackendData } from '@/lib/backend/page-data'
import type { DashboardOverview, MyActionsResult } from '@/features/reporting/contracts/view-model'

export const dynamic = 'force-dynamic'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [user, rawQuery] = await Promise.all([
    requirePagePermission('dashboard.read'),
    searchParams,
  ])
  const query = parseDashboardQuery(rawQuery)
  const search = new URLSearchParams(query).toString()
  const [dashboardResponse, actionsResponse] = await Promise.all([
    backendUserFetch(`/api/dashboard?${search}`, user),
    backendUserFetch('/api/my-actions', user),
  ])
  const [rawData, rawActions] = await Promise.all([
    readBackendData<Omit<DashboardOverview, 'query'> & { query: DashboardOverview['query'] }>(
      dashboardResponse, 'Не удалось загрузить сводку из backend',
    ),
    readBackendData<MyActionsResult>(actionsResponse, 'Не удалось загрузить личные задачи из backend'),
  ])
  const data = normalizeDashboardDates(rawData as DashboardOverview)
  const myActions = {
    ...rawActions,
    items: rawActions.items.map((item) => ({ ...item, dueAt: item.dueAt ? new Date(item.dueAt) : null })),
  }
  return (
    <DashboardPage
      data={data}
      myActions={myActions}
      canViewReports={user.access.has('reports.read')}
      canExport={user.access.has('reports.export')}
    />
  )
}

function normalizeDashboardDates(data: DashboardOverview): DashboardOverview {
  const date = (value: Date | string | null) => value ? new Date(value) : null
  return {
    ...data,
    activeProjects: data.activeProjects.map((item) => ({ ...item, startDate: date(item.startDate), endDate: date(item.endDate) })),
    currentAbsences: data.currentAbsences.map((item) => ({ ...item, startDate: new Date(item.startDate), endDate: new Date(item.endDate) })),
    contracts: data.contracts.map((item) => ({ ...item, contractEndDate: new Date(item.contractEndDate) })),
    overdueTasks: data.overdueTasks.map((item) => ({ ...item, endDate: new Date(item.endDate) })),
    recentActivity: data.recentActivity.map((item) => ({ ...item, date: new Date(item.date) })),
    analytics: {
      ...data.analytics,
      projects: data.analytics.projects.map((item) => ({ ...item, startDate: date(item.startDate), endDate: date(item.endDate) })),
      vacations: data.analytics.vacations.map((item) => ({ ...item, startDate: new Date(item.startDate), endDate: new Date(item.endDate) })),
    },
  }
}
