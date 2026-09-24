import { requirePagePermission } from '@/lib/auth/authorization'
import { ApprovalsPageClient } from '@/features/approvals/ui/approvals-page-client'

export const dynamic = 'force-dynamic'

export default async function ApprovalsPage() {
  const user = await requirePagePermission('approvals.read')

  return (
    <ApprovalsPageClient
      currentUserId={user.id}
      canCreate={user.permissions.includes('approvals.create')}
      canDecide={user.permissions.includes('approvals.decide')}
      canCancel={user.permissions.includes('approvals.cancel')}
      canManageTemplates={user.permissions.includes('approvals.templates.manage')}
    />
  )
}
