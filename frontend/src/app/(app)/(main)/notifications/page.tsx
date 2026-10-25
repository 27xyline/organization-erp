import { NotificationChannel, NotificationEventType } from '@/lib/contracts/enums'
import { NotificationsPageClient } from '@/features/notifications/ui/notifications-page-client'
import { requirePageUser } from '@/lib/auth/authorization'
import { backendUserFetch } from '@/lib/backend/transport'
import { readBackendData } from '@/lib/backend/page-data'

interface NotificationItem {
  id: string
  eventType: NotificationEventType
  title: string
  body: string
  targetUrl: string | null
  readAt: string | null
  createdAt: string
}

interface NotificationPreference {
  eventType: NotificationEventType
  channel: NotificationChannel
  enabled: boolean
}

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const user = await requirePageUser()
  const [notificationsResponse, preferencesResponse] = await Promise.all([
    backendUserFetch('/api/notifications?page=1&pageSize=50&unreadOnly=false', user),
    backendUserFetch('/api/notifications/preferences', user),
  ])
  const [notifications, preferences] = await Promise.all([
    readBackendData<NotificationItem[]>(notificationsResponse, 'Не удалось загрузить уведомления из backend'),
    readBackendData<NotificationPreference[]>(preferencesResponse, 'Не удалось загрузить настройки уведомлений из backend'),
  ])
  return (
    <NotificationsPageClient
      initialNotifications={notifications}
      initialPreferences={preferences}
      canGenerateAlerts={user.permissions.includes('access.users.update')}
    />
  )
}
