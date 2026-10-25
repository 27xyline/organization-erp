import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyStage11 } from '@/lib/backend/stage11'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'procurement.read')
  if (auth.response) return auth.response
  return proxyStage11(request, '/api/procurement/options', auth.user, auth.requestId)
}
