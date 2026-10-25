import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyStage09 } from '@/lib/backend/stage09'

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  return proxyStage09(request, '/api/notifications/read-all', auth.user, auth.requestId)
}
