import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createVacationSchema } from '@/features/employees/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyBackendRequest } from '@/lib/backend/bridge'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { apiError, apiValidationError } from '@/lib/http/api-response'
import { employeeTarget } from '@/lib/auth/resource-scopes'

const yearSchema = z.coerce.number().int().min(2000).max(2200)

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'vacations.read')
  if (auth.response) return auth.response
  const year = yearSchema.safeParse(request.nextUrl.searchParams.get('year') || new Date().getFullYear())
  if (!year.success) return apiValidationError(year.error)
  try {
    return await proxyBackendRequest(
      request,
      `/api/vacations${request.nextUrl.search ? `?${request.nextUrl.searchParams.toString()}` : ''}`,
      auth.user,
      auth.requestId,
    )
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'vacations.create')
  if (auth.response) return auth.response
  const input = createVacationSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)
  const target = await employeeTarget(input.data.employeeId)
  if (target && !auth.access.allows('vacations.create', target)) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  try {
    return await proxyBackendRequest(request, '/api/vacations', auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
