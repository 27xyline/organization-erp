import type { NextRequest } from 'next/server'
import { transferAssetSchema } from '@/features/assets/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyStage07Request } from '@/lib/backend/stage07'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.transfer')
  if (auth.response) return auth.response
  const input = transferAssetSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)
  const { id } = await params
  return proxyStage07Request(request, `/api/assets/${encodeURIComponent(id)}/transfers`, auth.user, auth.requestId)
}
