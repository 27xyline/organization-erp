import { getNotificationService } from '@/features/notifications/application/notification.service'
import { NotificationsPageClient } from '@/features/notifications/ui/notifications-page-client'
import { requirePageUser } from '@/lib/auth/authorization'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const user = await requirePageUser()
  const service = getNotificationService()
  const [result, preferences] = await Promise.all([
    service.list(user.id, { page: 1, pageSize: 50, unreadOnly: false }),
    service.getPreferences(user.id),
  ])
  return (
    <NotificationsPageClient
      initialNotifications={result.notifications.map((notification) => ({
        ...notification,
        readAt: notification.readAt?.toISOString() || null,
        createdAt: notification.createdAt.toISOString(),
      }))}
      initialPreferences={preferences}
      canGenerateAlerts={user.permissions.includes('access.users.update')}
    />
  )
}
