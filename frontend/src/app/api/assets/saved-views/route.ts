import type { NextRequest } from 'next/server'
import { createAssetSavedViewSchema } from '@/features/assets/contracts/saved-view'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyStage07Request } from '@/lib/backend/stage07'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.read')
  if (auth.response) return auth.response

  return proxyStage07Request(request, '/api/assets/saved-views', auth.user, auth.requestId)
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.read')
  if (auth.response) return auth.response

  const input = createAssetSavedViewSchema.safeParse(await request.clone().json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)

  return proxyStage07Request(request, '/api/assets/saved-views', auth.user, auth.requestId)
}
