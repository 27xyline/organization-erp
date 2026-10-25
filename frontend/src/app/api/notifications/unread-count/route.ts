import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyNotificationRequest } from '@/lib/backend/notifications'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  return proxyNotificationRequest(request, '/api/notifications/unread-count', auth.user, auth.requestId)
}
