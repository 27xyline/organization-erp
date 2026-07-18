import type { NextRequest } from 'next/server'
import { getNotificationService } from '@/features/notifications/application/notification.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData } from '@/lib/http/api-response'

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  return apiData({
    updated: await getNotificationService().markAllRead(auth.user.id),
  })
}
