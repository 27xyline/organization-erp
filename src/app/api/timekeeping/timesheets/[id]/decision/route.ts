import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiValidationError } from '@/lib/http/api-response'
import { timesheetDecisionSchema } from '@/features/timekeeping/contracts/time-entry'
import { TimesheetService } from '@/features/timekeeping/application/timesheet.service'
import { timekeepingApiError } from '@/features/timekeeping/application/http'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'timekeeping.timesheets.review')
  if (auth.response) return auth.response
  const input = timesheetDecisionSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  const { id } = await context.params
  try {
    return apiData(await new TimesheetService().decide(
      id,
      input.data,
      auth.user.id,
      auth.user.employeeId,
      auth.access,
      auth.requestId,
    ))
  } catch (error) {
    return timekeepingApiError(error)
  }
}
