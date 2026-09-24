import type { NextRequest } from 'next/server'
import { getAssetInventoryService } from '@/features/assets/application/inventory.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError } from '@/lib/http/api-response'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.inventory.manage')
  if (auth.response) return auth.response
  const inventoryNumber = request.nextUrl.searchParams.get('number')?.trim()
  if (!inventoryNumber || inventoryNumber.length > 100) {
    return apiError('VALIDATION_ERROR', 'Укажите корректный инвентарный номер', 422)
  }
  const entries = await getAssetInventoryService().resolve(inventoryNumber, auth.access)
  return apiData(entries)
}
