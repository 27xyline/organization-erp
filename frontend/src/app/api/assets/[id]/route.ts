import type { NextRequest } from 'next/server'
import { updateAssetSchema } from '@/features/assets/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyStage07AssetJsonRequest, proxyStage07Request } from '@/lib/backend/stage07'
import { normalizeLegacyAssetDates } from '@/features/assets/infrastructure/legacy-date-transport'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.read')
  if (auth.response) return auth.response

  const id = (await params).id
  return proxyStage07Request(request, `/api/assets/${encodeURIComponent(id)}`, auth.user, auth.requestId)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.update')
  if (auth.response) return auth.response

  const input = updateAssetSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)
  const id = (await params).id

  return proxyStage07AssetJsonRequest(
    request, `/api/assets/${encodeURIComponent(id)}`, auth.user, auth.requestId, normalizeLegacyAssetDates(input.data),
  )
}
