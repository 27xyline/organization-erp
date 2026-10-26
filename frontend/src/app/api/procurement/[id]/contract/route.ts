import type { NextRequest } from 'next/server'
import { contractSchema } from '@/features/procurement/contracts/procurement'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyProcurementRequest } from '@/lib/backend/procurement'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'procurement.contract')
  if (auth.response) return auth.response
  const input = contractSchema.safeParse(await request.clone().json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  return proxyProcurementRequest(
    request,
    `/api/procurement/${(await context.params).id}/contract`,
    auth.user,
    auth.requestId,
  )
}
