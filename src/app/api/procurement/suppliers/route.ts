import type { NextRequest } from 'next/server'
import { supplierSchema } from '@/features/procurement/contracts/procurement'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyStage11 } from '@/lib/backend/stage11'

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'procurement.suppliers.manage')
  if (auth.response) return auth.response
  const input = supplierSchema.safeParse(await request.clone().json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  return proxyStage11(request, '/api/procurement/suppliers', auth.user, auth.requestId)
}
