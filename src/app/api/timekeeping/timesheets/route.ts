import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiValidationError } from '@/lib/http/api-response'
import { submitTimesheetSchema } from '@/features/timekeeping/contracts/time-entry'
import { TimesheetService } from '@/features/timekeeping/application/timesheet.service'
import { timekeepingApiError } from '@/features/timekeeping/application/http'

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'timekeeping.timesheets.submit')
  if (auth.response) return auth.response
  const input = submitTimesheetSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(await new TimesheetService().submit(
      input.data,
      auth.user.id,
      auth.user.employeeId,
      auth.access,
      auth.requestId,
    ), { status: 201 })
  } catch (error) {
    return timekeepingApiError(error)
  }
}
