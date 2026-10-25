import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyAssetRequest } from '@/lib/backend/assets'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.inventory.manage')
  if (auth.response) return auth.response
  return proxyAssetRequest(request, '/api/assets/inventories/options', auth.user, auth.requestId)
}
