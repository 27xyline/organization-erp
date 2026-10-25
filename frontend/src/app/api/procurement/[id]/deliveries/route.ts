import type { NextRequest } from 'next/server'
import { deliverySchema } from '@/features/procurement/contracts/procurement'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyProcurementRequest } from '@/lib/backend/procurement'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'procurement.deliver')
  if (auth.response) return auth.response
  const input = deliverySchema.safeParse(await request.clone().json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  return proxyProcurementRequest(
    request,
    `/api/procurement/${(await context.params).id}/deliveries`,
    auth.user,
    auth.requestId,
  )
}
