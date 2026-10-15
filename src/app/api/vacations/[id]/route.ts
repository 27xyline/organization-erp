import type { NextRequest } from 'next/server'
import { createVacationSchema } from '@/features/employees/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyBackendRequest } from '@/lib/backend/bridge'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { apiError, apiValidationError } from '@/lib/http/api-response'
import { employeeTarget, vacationTarget } from '@/lib/auth/resource-scopes'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'vacations.update')
  if (auth.response) return auth.response
  const input = createVacationSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)
  const id = (await params).id
  const [currentTarget, nextTarget] = await Promise.all([
    vacationTarget(id),
    employeeTarget(input.data.employeeId),
  ])
  const departmentIds = [
    ...(currentTarget?.departmentId ? [currentTarget.departmentId] : []),
    ...(nextTarget?.departmentId ? [nextTarget.departmentId] : []),
  ]
  if (currentTarget && !auth.access.allows('vacations.update', {
    employeeId: currentTarget.employeeId,
    departmentIds,
  })) return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  try {
    return await proxyBackendRequest(
      request,
      `/api/vacations/${encodeURIComponent(id)}`,
      auth.user,
      auth.requestId,
    )
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'vacations.delete')
  if (auth.response) return auth.response
  const id = (await params).id
  const target = await vacationTarget(id)
  if (target && !auth.access.allows('vacations.delete', target)) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  try {
    return await proxyBackendRequest(
      request,
      `/api/vacations/${encodeURIComponent(id)}`,
      auth.user,
      auth.requestId,
    )
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
