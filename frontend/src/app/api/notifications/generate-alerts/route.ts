import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyNotificationRequest } from '@/lib/backend/notifications'

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'access.users.update')
  if (auth.response) return auth.response
  return proxyNotificationRequest(request, '/api/notifications/generate-alerts', auth.user, auth.requestId)
}
