import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiValidationError } from '@/lib/http/api-response'
import { payrollPeriodSchema } from '@/features/finance/contracts/payroll'
import { PayrollService } from '@/features/finance/application/payroll.service'

export async function PUT(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'payroll.close')
  if (auth.response) return auth.response
  const input = payrollPeriodSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  const { status, ...query } = input.data
  return apiData(
    await PayrollService.setPeriodStatus(query, status, auth.user.id, auth.requestId),
  )
}
