import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData } from '@/lib/http/api-response'
import { PayrollService } from '@/features/finance/application/payroll.service'
import { payrollApiError } from '@/features/finance/application/payroll-http'

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'payroll.manage')
  if (auth.response) return auth.response
  try {
    await PayrollService.removeAdjustment((await context.params).id, auth.user.id, auth.requestId)
    return apiData({ success: true })
  } catch (error) {
    return payrollApiError(error)
  }
}
