import type { NextRequest } from 'next/server'
import { submitProcurementSchema } from '@/features/procurement/contracts/procurement'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyStage11 } from '@/lib/backend/stage11'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'procurement.submit')
  if (auth.response) return auth.response
  const input = submitProcurementSchema.safeParse(await request.clone().json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  return proxyStage11(
    request,
    `/api/procurement/${(await context.params).id}/submit`,
    auth.user,
    auth.requestId,
  )
}
