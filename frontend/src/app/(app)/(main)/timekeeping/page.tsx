import { requirePagePermission } from '@/lib/auth/authorization'
import { TimekeepingPage } from '@/features/timekeeping/ui/timekeeping-page'

export default async function Page() {
  const user = await requirePagePermission('timekeeping.read')
  return (
    <TimekeepingPage
      employeeId={user.employeeId}
      canSubmitOwn={user.permissions.includes('timekeeping.timesheets.submit')}
      canSubmitForOthers={
        user.roles.includes('ADMIN') || user.roles.includes('HR')
      }
      canReviewTimesheets={user.permissions.includes('timekeeping.timesheets.review')}
      canCorrect={user.permissions.includes('timekeeping.timesheets.correct')}
    />
  )
}
