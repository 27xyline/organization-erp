import type { NextRequest } from 'next/server'
import { recordAssetInventoryCountSchema } from '@/features/assets/contracts/inventory'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyStage07Request } from '@/lib/backend/stage07'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.inventory.manage')
  if (auth.response) return auth.response
  const input = recordAssetInventoryCountSchema.safeParse(await request.clone().json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  await context.params
  return proxyStage07Request(request, `${request.nextUrl.pathname}${request.nextUrl.search}`, auth.user, auth.requestId)
}
