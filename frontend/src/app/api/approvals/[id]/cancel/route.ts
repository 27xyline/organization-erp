import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyNotificationRequest } from '@/lib/backend/notifications'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'approvals.cancel')
  if (auth.response) return auth.response
  const { id } = await context.params
  return proxyNotificationRequest(request, `/api/approvals/${encodeURIComponent(id)}/cancel`, auth.user, auth.requestId)
}
