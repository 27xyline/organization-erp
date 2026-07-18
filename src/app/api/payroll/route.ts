import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiValidationError } from '@/lib/http/api-response'
import { createPayrollAdjustmentSchema, payrollQuerySchema } from '@/features/finance/contracts/payroll'
import { PayrollService } from '@/features/finance/application/payroll.service'
import { payrollApiError } from '@/features/finance/application/payroll-http'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'payroll.read')
  if (auth.response) return auth.response
  const query = payrollQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return apiValidationError(query.error)
  return apiData(await PayrollService.getMonth(query.data, auth.access))
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'payroll.manage')
  if (auth.response) return auth.response
  const input = createPayrollAdjustmentSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(
      await PayrollService.createAdjustment(input.data, auth.user.id, auth.requestId),
      { status: 201 },
    )
  } catch (error) {
    return payrollApiError(error)
  }
}
