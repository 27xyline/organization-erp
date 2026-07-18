import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiValidationError } from '@/lib/http/api-response'
import { updateTimeEntrySchema } from '@/features/timekeeping/contracts/time-entry'
import { TimekeepingService } from '@/features/timekeeping/application/timekeeping.service'
import { timekeepingApiError } from '@/features/timekeeping/application/http'

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'timekeeping.update')
  if (auth.response) return auth.response
  const input = updateTimeEntrySchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  const { id } = await context.params
  try {
    return apiData(
      await TimekeepingService.update(
        id,
        input.data,
        auth.access,
        auth.user.id,
        auth.requestId,
      ),
    )
  } catch (error) {
    return timekeepingApiError(error)
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'timekeeping.delete')
  if (auth.response) return auth.response
  const { id } = await context.params
  try {
    await TimekeepingService.remove(id, auth.access, auth.user.id, auth.requestId)
    return apiData({ success: true })
  } catch (error) {
    return timekeepingApiError(error)
  }
}
