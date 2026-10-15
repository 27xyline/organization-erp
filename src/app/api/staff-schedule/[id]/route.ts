import type { NextRequest } from 'next/server'
import { createStaffScheduleSchema } from '@/features/employees/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyBackendRequest } from '@/lib/backend/bridge'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { apiError, apiValidationError } from '@/lib/http/api-response'
import { departmentForReference, staffPositionTarget } from '@/lib/auth/resource-scopes'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'staffSchedule.update')
  if (auth.response) return auth.response
  const input = createStaffScheduleSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)
  const id = (await params).id
  const [currentTarget, nextDepartmentId] = await Promise.all([
    staffPositionTarget(id),
    departmentForReference(input.data),
  ])
  if (currentTarget && !auth.access.allows('staffSchedule.update', {
    departmentIds: [
      ...(currentTarget.departmentId ? [currentTarget.departmentId] : []),
      ...(nextDepartmentId ? [nextDepartmentId] : []),
    ],
  })) return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  try {
    return await proxyBackendRequest(
      request,
      `/api/staff-schedule/${encodeURIComponent(id)}`,
      auth.user,
      auth.requestId,
    )
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'staffSchedule.delete')
  if (auth.response) return auth.response
  const id = (await params).id
  const target = await staffPositionTarget(id)
  if (target && !auth.access.allows('staffSchedule.delete', target)) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  try {
    return await proxyBackendRequest(
      request,
      `/api/staff-schedule/${encodeURIComponent(id)}`,
      auth.user,
      auth.requestId,
    )
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
