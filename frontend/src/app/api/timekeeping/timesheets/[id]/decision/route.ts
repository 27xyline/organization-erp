import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { timesheetDecisionSchema } from '@/features/timekeeping/contracts/time-entry'
import { proxyFinanceRequest } from '@/lib/backend/finance'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'timekeeping.timesheets.review')
  if (auth.response) return auth.response
  const input = timesheetDecisionSchema.safeParse(await request.clone().json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  const { id } = await context.params
  return proxyFinanceRequest(
    request,
    `/api/timekeeping/timesheets/${id}/decision`,
    auth.user,
    auth.requestId,
  )
}
