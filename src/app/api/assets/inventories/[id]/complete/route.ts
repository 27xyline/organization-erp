import type { NextRequest } from 'next/server'
import { getAssetInventoryService } from '@/features/assets/application/inventory.service'
import { assetInventoryApiError } from '@/features/assets/application/inventory-http'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData } from '@/lib/http/api-response'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.inventory.manage')
  if (auth.response) return auth.response
  const { id } = await context.params
  try {
    return apiData(await getAssetInventoryService().complete(
      id,
      auth.user.id,
      auth.access,
      auth.requestId,
    ))
  } catch (error) {
    const response = assetInventoryApiError(error)
    if (response) return response
    throw error
  }
}
