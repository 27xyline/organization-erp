import { requirePagePermission } from '@/lib/auth/authorization'
import { ProcurementPage } from '@/features/procurement/ui/procurement-page'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const user = await requirePagePermission('procurement.read')
  return (
    <ProcurementPage
      canCreate={user.permissions.includes('procurement.create')}
      canSubmit={user.permissions.includes('procurement.submit')}
      canContract={user.permissions.includes('procurement.contract')}
      canDeliver={user.permissions.includes('procurement.deliver')}
      canCapitalize={user.permissions.includes('procurement.capitalize')}
      canManageSuppliers={user.permissions.includes('procurement.suppliers.manage')}
    />
  )
}
