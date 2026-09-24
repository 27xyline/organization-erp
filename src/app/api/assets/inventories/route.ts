import type { NextRequest } from 'next/server'
import { getAssetInventoryService } from '@/features/assets/application/inventory.service'
import { assetInventoryApiError } from '@/features/assets/application/inventory-http'
import {
  assetInventoryListQuerySchema,
  createAssetInventorySchema,
} from '@/features/assets/contracts/inventory'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiList, apiValidationError } from '@/lib/http/api-response'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.inventory.manage')
  if (auth.response) return auth.response

  const query = assetInventoryListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return apiValidationError(query.error)
  const result = await getAssetInventoryService().list(query.data, auth.access)
  return apiList(result.inventories, {
    page: query.data.page,
    pageSize: query.data.pageSize,
    total: result.total,
  })
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.inventory.manage')
  if (auth.response) return auth.response

  const input = createAssetInventorySchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  try {
    const inventory = await getAssetInventoryService().create(
      input.data,
      auth.user.id,
      auth.access,
      auth.requestId,
    )
    return apiData(inventory, { status: 201 })
  } catch (error) {
    const response = assetInventoryApiError(error)
    if (response) return response
    throw error
  }
}
