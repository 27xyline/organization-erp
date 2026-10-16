import { authorizeApiRequest } from '@/lib/auth/authorization'
import type { NextRequest } from 'next/server'
import { proxyStage07Request } from '@/lib/backend/stage07'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.create')
  if (auth.response) return auth.response

  return proxyStage07Request(request, '/api/assets/import/template', auth.user, auth.requestId)
}
