import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyStage09 } from '@/lib/backend/stage09'

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'access.users.update')
  if (auth.response) return auth.response
  return proxyStage09(request, '/api/notifications/generate-alerts', auth.user, auth.requestId)
}
