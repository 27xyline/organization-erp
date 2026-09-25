import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiValidationError } from '@/lib/http/api-response'
import { payrollPeriodSchema } from '@/features/finance/contracts/payroll'
import { PayrollError, PayrollService } from '@/features/finance/application/payroll.service'
import { apiError } from '@/lib/http/api-response'

export async function PUT(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'payroll.close')
  if (auth.response) return auth.response
  const input = payrollPeriodSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  const { status, reason, ...query } = input.data
  try {
    return apiData(
      await PayrollService.setPeriodStatus(query, status, auth.user.id, auth.requestId, reason),
    )
  } catch (error) {
    if (!(error instanceof PayrollError)) throw error
    if (error.code === 'PAYROLL_TIMESHEETS_PENDING') {
      return apiError(error.code, 'Нельзя закрыть месяц: утвердите табели всех сотрудников и подтвердите нулевые часы', 409)
    }
    if (error.code === 'REOPEN_REASON_REQUIRED') {
      return apiError(error.code, 'Укажите причину повторного открытия расчётного месяца', 422)
    }
    throw error
  }
}
