import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyNotificationRequest } from '@/lib/backend/notifications'

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  return proxyNotificationRequest(request, '/api/notifications/read-all', auth.user, auth.requestId)
}
