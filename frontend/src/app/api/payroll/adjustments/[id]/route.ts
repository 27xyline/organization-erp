import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyFinanceRequest } from '@/lib/backend/finance'

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'payroll.manage')
  if (auth.response) return auth.response
  return proxyFinanceRequest(
    request,
    `/api/payroll/adjustments/${(await context.params).id}`,
    auth.user,
    auth.requestId,
  )
}
