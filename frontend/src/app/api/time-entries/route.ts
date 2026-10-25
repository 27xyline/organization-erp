import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import {
  createTimeEntrySchema,
  timeEntryQuerySchema,
} from '@/features/timekeeping/contracts/time-entry'
import { proxyStage10Request } from '@/lib/backend/stage10'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'timekeeping.read')
  if (auth.response) return auth.response
  const query = timeEntryQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return apiValidationError(query.error)
  return proxyStage10Request(
    request,
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    auth.user,
    auth.requestId,
  )
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'timekeeping.create')
  if (auth.response) return auth.response
  const input = createTimeEntrySchema.safeParse(await request.clone().json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  return proxyStage10Request(request, '/api/time-entries', auth.user, auth.requestId)
}
