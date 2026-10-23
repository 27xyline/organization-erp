import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyStage09 } from '@/lib/backend/stage09'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'approvals.create')
  if (auth.response) return auth.response
  return proxyStage09(request, '/api/approvals/options', auth.user, auth.requestId)
}
