import type { NextRequest } from 'next/server'
import { getProcurementService } from '@/features/procurement/application/procurement.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData } from '@/lib/http/api-response'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'procurement.read')
  if (auth.response) return auth.response
  return apiData(await getProcurementService().options(auth.access.has('documents.read')))
}
