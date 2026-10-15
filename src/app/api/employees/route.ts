import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyBackendRequest } from '@/lib/backend/bridge'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { apiError, apiValidationError } from '@/lib/http/api-response'
import { createEmployeeSchema } from '@/features/employees/contracts/schemas'
import { departmentForPosition } from '@/lib/auth/resource-scopes'

const querySchema = z.object({
  scope: z.enum(['active', 'archive', 'expired', 'all']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

function backendPath(request: NextRequest) {
  const search = request.nextUrl.searchParams
  return `/api/employees${search.size ? `?${search.toString()}` : ''}`
}

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'employees.read')
  if (auth.response) return auth.response
  const raw = Object.fromEntries(request.nextUrl.searchParams)
  const query = querySchema.safeParse(raw)
  if (!query.success) return apiValidationError(query.error)
  try {
    return await proxyBackendRequest(request, backendPath(request), auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'employees.create')
  if (auth.response) return auth.response
  const input = createEmployeeSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)
  const departmentId = await departmentForPosition(input.data.staffScheduleId)
  if (departmentId && !auth.access.allows('employees.create', { departmentId })) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  try {
    return await proxyBackendRequest(request, '/api/employees', auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
