import { DashboardService } from '@/features/reporting/application/dashboard.service'
import { parseDashboardQuery } from '@/features/reporting/contracts/dashboard'
import { DashboardPage } from '@/features/reporting/ui/dashboard-page'
import { getApprovalService } from '@/features/approvals/application/approval.service'
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
  const [data, approvalInbox] = await Promise.all([
    DashboardService.getOverview(parseDashboardQuery(rawQuery), user.access),
    user.access.has('approvals.read')
      ? getApprovalService().listPendingForUser(user.id, 5)
      : Promise.resolve(null),
  ])
  return (
    <DashboardPage
      data={data}
      approvalInbox={approvalInbox}
      canViewReports={user.access.has('reports.read')}
      canExport={user.access.has('reports.export')}
    />
  )
}
