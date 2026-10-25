import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyStage09 } from '@/lib/backend/stage09'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  return proxyStage09(request, '/api/notifications/unread-count', auth.user, auth.requestId)
}
