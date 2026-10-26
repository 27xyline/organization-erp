import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyAssetRequest } from '@/lib/backend/assets'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.restore')
  if (auth.response) return auth.response
  const id = (await params).id

  return proxyAssetRequest(request, `/api/assets/${encodeURIComponent(id)}/restore`, auth.user, auth.requestId)
}
