import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiValidationError } from '@/lib/http/api-response'
import {
  createTimeEntrySchema,
  timeEntryQuerySchema,
} from '@/features/timekeeping/contracts/time-entry'
import { TimekeepingService } from '@/features/timekeeping/application/timekeeping.service'
import { timekeepingApiError } from '@/features/timekeeping/application/http'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'timekeeping.read')
  if (auth.response) return auth.response
  const query = timeEntryQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return apiValidationError(query.error)
  const [month, options] = await Promise.all([
    TimekeepingService.getMonth(query.data, auth.access),
    TimekeepingService.options(auth.access),
  ])
  return apiData({ ...month, ...options })
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'timekeeping.create')
  if (auth.response) return auth.response
  const input = createTimeEntrySchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(
      await TimekeepingService.create(
        input.data,
        auth.access,
        auth.user.id,
        auth.requestId,
      ),
      { status: 201 },
    )
  } catch (error) {
    return timekeepingApiError(error)
  }
}
