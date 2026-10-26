import type { NextRequest } from 'next/server'
import { createProcurementSchema, procurementQuerySchema } from '@/features/procurement/contracts/procurement'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyProcurementRequest } from '@/lib/backend/procurement'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'procurement.read')
  if (auth.response) return auth.response
  const query = procurementQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return apiValidationError(query.error)
  return proxyProcurementRequest(
    request,
    `/api/procurement${request.nextUrl.search}`,
    auth.user,
    auth.requestId,
  )
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'procurement.create')
  if (auth.response) return auth.response
  const input = createProcurementSchema.safeParse(await request.clone().json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  return proxyProcurementRequest(request, '/api/procurement', auth.user, auth.requestId)
}
