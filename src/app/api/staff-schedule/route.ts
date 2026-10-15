import type { NextRequest } from 'next/server'
import { createStaffScheduleSchema } from '@/features/employees/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyBackendRequest } from '@/lib/backend/bridge'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { apiError, apiValidationError } from '@/lib/http/api-response'
import { departmentForReference } from '@/lib/auth/resource-scopes'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'staffSchedule.read')
  if (auth.response) return auth.response
  try {
    return await proxyBackendRequest(request, '/api/staff-schedule', auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'staffSchedule.create')
  if (auth.response) return auth.response
  const input = createStaffScheduleSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)
  const departmentId = await departmentForReference(input.data)
  if (departmentId && !auth.access.allows('staffSchedule.create', { departmentId })) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  try {
    return await proxyBackendRequest(request, '/api/staff-schedule', auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
