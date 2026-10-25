import { requirePagePermission } from '@/lib/auth/authorization'
import { PayrollPage } from '@/features/finance/ui/payroll-page'

export default async function Page() {
  const user = await requirePagePermission('payroll.read')
  return (
    <PayrollPage
      canManage={user.permissions.includes('payroll.manage')}
      canClose={user.permissions.includes('payroll.close')}
      canExport={user.permissions.includes('payroll.export')}
    />
  )
}
