import type { NextRequest } from 'next/server'
import { disposeAssetSchema } from '@/features/assets/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyAssetRequest } from '@/lib/backend/assets'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.dispose')
  if (auth.response) return auth.response
  const input = disposeAssetSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)

  const { id } = await params
  return proxyAssetRequest(request, `/api/assets/${encodeURIComponent(id)}/disposals`, auth.user, auth.requestId)
}
