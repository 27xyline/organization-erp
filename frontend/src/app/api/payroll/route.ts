import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { createPayrollAdjustmentSchema, payrollQuerySchema } from '@/features/finance/contracts/payroll'
import { proxyFinanceRequest } from '@/lib/backend/finance'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'payroll.read')
  if (auth.response) return auth.response
  const query = payrollQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return apiValidationError(query.error)
  return proxyFinanceRequest(
    request,
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    auth.user,
    auth.requestId,
  )
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'payroll.manage')
  if (auth.response) return auth.response
  const input = createPayrollAdjustmentSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  return proxyFinanceRequest(request, '/api/payroll', auth.user, auth.requestId)
}
