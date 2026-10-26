import { FinancePlanPage } from '@/features/finance/ui/finance-plan-page'
import { requirePagePermission } from '@/lib/auth/authorization'

export default async function NadbavkaPage() {
  const user = await requirePagePermission('financePlans.read')
  return <FinancePlanPage type="nadbavka" canEdit={user.access.has('financePlans.update')} />
}
