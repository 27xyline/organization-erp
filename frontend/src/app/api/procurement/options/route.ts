import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyProcurementRequest } from '@/lib/backend/procurement'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'procurement.read')
  if (auth.response) return auth.response
  return proxyProcurementRequest(request, '/api/procurement/options', auth.user, auth.requestId)
}
