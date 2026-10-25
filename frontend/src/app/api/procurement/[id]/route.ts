import type { NextRequest } from 'next/server'
import { updateProcurementSchema } from '@/features/procurement/contracts/procurement'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyStage11 } from '@/lib/backend/stage11'

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'procurement.read')
  if (auth.response) return auth.response
  return proxyStage11(
    request,
    `/api/procurement/${(await context.params).id}`,
    auth.user,
    auth.requestId,
  )
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'procurement.update')
  if (auth.response) return auth.response
  const input = updateProcurementSchema.safeParse(await request.clone().json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  return proxyStage11(
    request,
    `/api/procurement/${(await context.params).id}`,
    auth.user,
    auth.requestId,
  )
}
