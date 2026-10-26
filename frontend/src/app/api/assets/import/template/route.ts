import { authorizeApiRequest } from '@/lib/auth/authorization'
import type { NextRequest } from 'next/server'
import { proxyAssetRequest } from '@/lib/backend/assets'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.create')
  if (auth.response) return auth.response

  return proxyAssetRequest(request, '/api/assets/import/template', auth.user, auth.requestId)
}
