import { requirePagePermission } from '@/lib/auth/authorization'
import { TimekeepingPage } from '@/features/timekeeping/ui/timekeeping-page'

export default async function Page() {
  const user = await requirePagePermission('timekeeping.read')
  return (
    <TimekeepingPage
      canManage={user.permissions.includes('timekeeping.create')}
    />
  )
}
