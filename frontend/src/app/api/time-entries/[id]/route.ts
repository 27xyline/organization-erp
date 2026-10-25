import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { timeEntryDeleteSchema, updateTimeEntrySchema } from '@/features/timekeeping/contracts/time-entry'
import { proxyStage10Request } from '@/lib/backend/stage10'

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'timekeeping.update')
  if (auth.response) return auth.response
  const input = updateTimeEntrySchema.safeParse(await request.clone().json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  const { id } = await context.params
  return proxyStage10Request(request, `/api/time-entries/${id}`, auth.user, auth.requestId)
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'timekeeping.delete')
  if (auth.response) return auth.response
  const input = timeEntryDeleteSchema.safeParse(await request.clone().json().catch(() => ({})))
  if (!input.success) return apiValidationError(input.error)
  const { id } = await context.params
  return proxyStage10Request(request, `/api/time-entries/${id}`, auth.user, auth.requestId)
}
