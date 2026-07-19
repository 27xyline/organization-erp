import { DashboardService } from '@/features/reporting/application/dashboard.service'
import { parseDashboardQuery } from '@/features/reporting/contracts/dashboard'
import { ReportsPage } from '@/features/reporting/ui/reports-page'
import { requirePagePermission } from '@/lib/auth/authorization'

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
  return <ReportsPage data={data} canExport={user.access.has('reports.export')} />
}

