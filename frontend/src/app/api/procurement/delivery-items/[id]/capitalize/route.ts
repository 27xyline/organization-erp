import type { NextRequest } from 'next/server'
import { capitalizeDeliveryItemSchema } from '@/features/procurement/contracts/procurement'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyProcurementRequest } from '@/lib/backend/procurement'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'procurement.capitalize')
  if (auth.response) return auth.response
  const input = capitalizeDeliveryItemSchema.safeParse(await request.clone().json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  return proxyProcurementRequest(
    request,
    `/api/procurement/delivery-items/${(await context.params).id}/capitalize`,
    auth.user,
    auth.requestId,
  )
}
