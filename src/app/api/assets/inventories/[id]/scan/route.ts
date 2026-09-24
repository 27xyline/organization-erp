import type { NextRequest } from 'next/server'
import { getAssetInventoryService } from '@/features/assets/application/inventory.service'
import { assetInventoryApiError } from '@/features/assets/application/inventory-http'
import { recordAssetInventoryCountSchema } from '@/features/assets/contracts/inventory'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiValidationError } from '@/lib/http/api-response'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.inventory.manage')
  if (auth.response) return auth.response
  const input = recordAssetInventoryCountSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  const { id } = await context.params
  try {
    return apiData(await getAssetInventoryService().recordCount(
      id,
      input.data,
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
