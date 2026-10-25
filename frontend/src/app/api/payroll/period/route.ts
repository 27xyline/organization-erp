import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { payrollPeriodSchema } from '@/features/finance/contracts/payroll'
import { proxyFinanceRequest } from '@/lib/backend/finance'

export async function PUT(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'payroll.close')
  if (auth.response) return auth.response
  const input = payrollPeriodSchema.safeParse(await request.clone().json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  return proxyFinanceRequest(request, '/api/payroll/period', auth.user, auth.requestId)
}
