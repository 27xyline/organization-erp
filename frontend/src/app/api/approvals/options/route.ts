import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyNotificationRequest } from '@/lib/backend/notifications'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'approvals.create')
  if (auth.response) return auth.response
  return proxyNotificationRequest(request, '/api/approvals/options', auth.user, auth.requestId)
}
