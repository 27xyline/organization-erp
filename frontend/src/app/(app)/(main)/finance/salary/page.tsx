import { FinancePlanPage } from '@/features/finance/ui/finance-plan-page'
import { requirePagePermission } from '@/lib/auth/authorization'

export default async function SalaryPage() {
  await requirePagePermission('finance.salary.read')
  return <FinancePlanPage type="salary" />
}
