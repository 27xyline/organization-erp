import { DashboardService } from '@/features/reporting/application/dashboard.service'
import { parseDashboardQuery } from '@/features/reporting/contracts/dashboard'
import { DashboardPage } from '@/features/reporting/ui/dashboard-page'
import { MyActionsService } from '@/features/reporting/application/my-actions.service'
import { requirePagePermission } from '@/lib/auth/authorization'

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
  const [data, myActions] = await Promise.all([
    DashboardService.getOverview(parseDashboardQuery(rawQuery), user.access),
    new MyActionsService().getForUser(user),
  ])
  return (
    <DashboardPage
      data={data}
      myActions={myActions}
      canViewReports={user.access.has('reports.read')}
      canExport={user.access.has('reports.export')}
    />
  )
}
