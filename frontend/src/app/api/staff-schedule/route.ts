import type { NextRequest } from 'next/server'
import { createStaffScheduleSchema } from '@/features/employees/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyBackendRequest } from '@/lib/backend/transport'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { apiValidationError } from '@/lib/http/api-response'

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
  try {
    return await proxyBackendRequest(request, '/api/staff-schedule', auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
