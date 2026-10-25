import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyStage07Request } from '@/lib/backend/stage07'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.inventory.manage')
  if (auth.response) return auth.response
  return proxyStage07Request(request, '/api/assets/inventories/options', auth.user, auth.requestId)
}
