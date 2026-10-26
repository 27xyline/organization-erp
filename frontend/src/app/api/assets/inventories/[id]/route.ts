import type { NextRequest } from 'next/server'
import { assetInventoryEntriesQuerySchema } from '@/features/assets/contracts/inventory'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyAssetRequest } from '@/lib/backend/assets'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.inventory.manage')
  if (auth.response) return auth.response
  const query = assetInventoryEntriesQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return apiValidationError(query.error)
  await context.params
  return proxyAssetRequest(request, `${request.nextUrl.pathname}${request.nextUrl.search}`, auth.user, auth.requestId)
}
