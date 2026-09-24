import type { NextRequest } from 'next/server'
import { getAssetInventoryService } from '@/features/assets/application/inventory.service'
import { assetInventoryApiError } from '@/features/assets/application/inventory-http'
import { assetInventoryEntriesQuerySchema } from '@/features/assets/contracts/inventory'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiValidationError } from '@/lib/http/api-response'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.inventory.manage')
  if (auth.response) return auth.response
  const query = assetInventoryEntriesQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return apiValidationError(query.error)
  const { id } = await context.params
  try {
    return apiData(await getAssetInventoryService().get(id, query.data, auth.access))
  } catch (error) {
    const response = assetInventoryApiError(error)
    if (response) return response
    throw error
  }
}
