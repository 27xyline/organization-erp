import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { submitTimesheetSchema } from '@/features/timekeeping/contracts/time-entry'
import { proxyFinanceRequest } from '@/lib/backend/finance'

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'timekeeping.timesheets.submit')
  if (auth.response) return auth.response
  const input = submitTimesheetSchema.safeParse(await request.clone().json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  return proxyFinanceRequest(request, '/api/timekeeping/timesheets', auth.user, auth.requestId)
}
