import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyAssetRequest } from '@/lib/backend/assets'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.read')
  if (auth.response) return auth.response
  const { id } = await context.params
  const path = new URL(`/api/assets/${encodeURIComponent(id)}/qr`, request.nextUrl.origin)
  path.searchParams.set('origin', process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin)
  return proxyAssetRequest(request, `${path.pathname}${path.search}`, auth.user, auth.requestId)
}
