import type { NextRequest } from 'next/server'
import { getNotificationService } from '@/features/notifications/application/notification.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData } from '@/lib/http/api-response'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  return apiData({ count: await getNotificationService().unreadCount(auth.user.id) })
}
