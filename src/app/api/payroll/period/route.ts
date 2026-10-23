import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { payrollPeriodSchema } from '@/features/finance/contracts/payroll'
import { proxyStage10Request } from '@/lib/backend/stage10'

export async function PUT(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'payroll.close')
  if (auth.response) return auth.response
  const input = payrollPeriodSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  return proxyStage10Request(request, '/api/payroll/period', auth.user, auth.requestId)
}
