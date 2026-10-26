import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createPersonnelActionSchema } from '@/features/employees/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyBackendRequest } from '@/lib/backend/transport'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { apiValidationError } from '@/lib/http/api-response'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'personnelActions.read')
  if (auth.response) return auth.response
  const raw = Object.fromEntries(request.nextUrl.searchParams)
  if (raw.limit && !raw.pageSize) raw.pageSize = raw.limit
  const query = querySchema.safeParse(raw)
  if (!query.success) return apiValidationError(query.error)
  try {
    const target = `/api/personnel-actions${request.nextUrl.search ? `?${request.nextUrl.searchParams.toString()}` : ''}`
    return await proxyBackendRequest(request, target, auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'personnelActions.create')
  if (auth.response) return auth.response
  const input = createPersonnelActionSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return await proxyBackendRequest(request, '/api/personnel-actions', auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
