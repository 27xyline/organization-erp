import type { NextRequest } from 'next/server'
import {
  assetInventoryListQuerySchema,
  createAssetInventorySchema,
} from '@/features/assets/contracts/inventory'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyAssetRequest } from '@/lib/backend/assets'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.inventory.manage')
  if (auth.response) return auth.response

  const query = assetInventoryListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return apiValidationError(query.error)
  return proxyAssetRequest(request, `${request.nextUrl.pathname}${request.nextUrl.search}`, auth.user, auth.requestId)
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.inventory.manage')
  if (auth.response) return auth.response

  const input = createAssetInventorySchema.safeParse(await request.clone().json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  return proxyAssetRequest(request, '/api/assets/inventories', auth.user, auth.requestId)
}
