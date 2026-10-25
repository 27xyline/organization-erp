import type { NextRequest } from 'next/server'
import { createAssetSavedViewSchema } from '@/features/assets/contracts/saved-view'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyAssetRequest } from '@/lib/backend/assets'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.read')
  if (auth.response) return auth.response

  return proxyAssetRequest(request, '/api/assets/saved-views', auth.user, auth.requestId)
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.read')
  if (auth.response) return auth.response

  const input = createAssetSavedViewSchema.safeParse(await request.clone().json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)

  return proxyAssetRequest(request, '/api/assets/saved-views', auth.user, auth.requestId)
}
