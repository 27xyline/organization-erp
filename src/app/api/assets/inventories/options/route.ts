import type { NextRequest } from 'next/server'
import { getAssetInventoryService } from '@/features/assets/application/inventory.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData } from '@/lib/http/api-response'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.inventory.manage')
  if (auth.response) return auth.response
  return apiData(await getAssetInventoryService().mols(auth.access))
}
