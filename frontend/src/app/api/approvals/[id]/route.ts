import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyNotificationRequest } from '@/lib/backend/notifications'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'approvals.read')
  if (auth.response) return auth.response
  const { id } = await context.params
  return proxyNotificationRequest(request, `/api/approvals/${encodeURIComponent(id)}`, auth.user, auth.requestId)
}
